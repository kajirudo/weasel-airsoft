-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 012: complete_mission RPC — task_done をアトミックインクリメント
--
-- 問題: JS 側で SELECT task_done → UPDATE task_done+1 をすると
--       複数プレイヤーが同時に完了した場合にロストアップデートが起きる。
-- 解決: PostgreSQL の FOR UPDATE ロック + UPDATE ... RETURNING で
--       SELECT と UPDATE を単一トランザクション内でアトミックに実行する。
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.complete_mission(
  p_objective_id  uuid,
  p_player_id     uuid,
  p_device_id     text,
  p_game_id       uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_obj       public.game_objectives%ROWTYPE;
  v_elapsed   float8;
  v_task_done int;
  v_task_goal int;
  v_crew_wins boolean := false;
  v_now       timestamptz := now();
  v_updated   int;
BEGIN
  -- ── プレイヤー本人確認 ─────────────────────────────────────────────────
  PERFORM 1 FROM public.players
    WHERE id = p_player_id AND device_id = p_device_id AND game_id = p_game_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_PLAYER'; END IF;

  -- ── オブジェクト取得 & 検証（FOR UPDATE で行ロック） ──────────────────
  SELECT * INTO v_obj FROM public.game_objectives
    WHERE id = p_objective_id AND game_id = p_game_id FOR UPDATE;
  IF NOT FOUND OR v_obj.type <> 'generator' THEN
    RAISE EXCEPTION 'NOT_A_TASK';
  END IF;
  -- 既に起動済みなら冪等リターン
  IF v_obj.is_activated THEN
    RETURN jsonb_build_object('taskDone', 0, 'taskGoal', 0, 'crewWins', false);
  END IF;
  IF v_obj.activating_by <> p_player_id  THEN RAISE EXCEPTION 'NOT_ACTIVATING'; END IF;
  IF v_obj.activate_start IS NULL         THEN RAISE EXCEPTION 'NOT_STARTED';    END IF;

  -- ── 10秒ホールドチェック ───────────────────────────────────────────────
  v_elapsed := EXTRACT(EPOCH FROM (v_now - v_obj.activate_start)) * 1000;
  IF v_elapsed < 9500 THEN RAISE EXCEPTION 'TOO_EARLY'; END IF;

  -- ── タスク完了（競合防止: is_activated = false 条件付き UPDATE） ─────────
  UPDATE public.game_objectives
    SET is_activated = true, activate_start = null, activating_by = null
    WHERE id = p_objective_id AND is_activated = false;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  -- 別クライアントが先に完了させていたら中断
  IF v_updated = 0 THEN
    RETURN jsonb_build_object('taskDone', 0, 'taskGoal', 0, 'crewWins', false);
  END IF;

  -- ── task_done をアトミックにインクリメント & 結果を取得 ─────────────────
  UPDATE public.games
    SET task_done = task_done + 1
    WHERE id = p_game_id
    RETURNING task_done, task_goal INTO v_task_done, v_task_goal;

  -- ── Crew 勝利判定 ──────────────────────────────────────────────────────
  IF v_task_goal > 0 AND v_task_done >= v_task_goal THEN
    v_crew_wins := true;
    UPDATE public.games
      SET status = 'finished', finished_at = v_now, winner_team = 'crew'
      WHERE id = p_game_id AND status = 'active';   -- 二重終了防止
  END IF;

  RETURN jsonb_build_object(
    'taskDone',  v_task_done,
    'taskGoal',  v_task_goal,
    'crewWins',  v_crew_wins
  );
END;
$$;

-- RLS は SECURITY DEFINER なので不要（サービスロールとして実行される）
GRANT EXECUTE ON FUNCTION public.complete_mission(uuid, uuid, text, uuid) TO anon, authenticated;
