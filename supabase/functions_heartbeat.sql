-- Weasel-Airsoft: Heartbeat RPC
-- Run AFTER schema.sql, all migrations, and functions.sql

-- ─── mark_player_seen ──────────────────────────────────────────────────────────
-- クライアントが 5 秒ごとに呼び出すハートビート関数。
--
-- 処理内容:
--   1. 呼び出し元プレイヤーの last_seen を now() に更新（device_id で本人確認）
--   2. 同ゲームで is_alive=true かつ last_seen が p_timeout_seconds 以上古い
--      プレイヤーを自動失格（hp=0, is_alive=false）
--   3. 失格者が出た場合、register_hit と同様の勝利判定を実施
--
-- 安全性:
--   - device_id 検証により本人以外の last_seen は更新不可
--   - SECURITY DEFINER + search_path 固定でスキーマ注入を防止
--   - anon/authenticated に EXECUTE 付与（公開 API として扱う）

CREATE OR REPLACE FUNCTION public.mark_player_seen(
  p_player_id       UUID,
  p_device_id       TEXT,
  p_timeout_seconds INT DEFAULT 15
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player      RECORD;
  v_game        RECORD;
  v_forfeited   BOOL := false;
  v_alive_cnt   INT;
  v_winner_id   UUID;
BEGIN
  -- 1. device_id 検証 + last_seen 更新
  UPDATE public.players
    SET last_seen = now()
    WHERE id = p_player_id AND device_id = p_device_id
    RETURNING * INTO v_player;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PLAYER_NOT_FOUND';
  END IF;

  -- ロビーや終了済みゲームは失格チェック不要
  SELECT * INTO v_game FROM public.games WHERE id = v_player.game_id;
  IF v_game.status <> 'active' THEN
    RETURN json_build_object('ok', true, 'forfeited', false);
  END IF;

  -- 2. タイムアウトしたプレイヤーを失格にする
  --    （呼び出し元自身は除外 — 自分の last_seen を更新した直後なので）
  UPDATE public.players
    SET hp = 0, is_alive = false
    WHERE game_id = v_player.game_id
      AND is_alive = true
      AND id        <> p_player_id
      AND last_seen <  now() - (p_timeout_seconds || ' seconds')::INTERVAL;

  GET DIAGNOSTICS v_forfeited = ROW_COUNT;
  -- v_forfeited = true if any row was updated (ROW_COUNT > 0)
  -- (BOOL assignment from INT: 0 = false, otherwise true)
  v_forfeited := (v_forfeited IS DISTINCT FROM false);

  -- 3. 失格者が出た場合のみ勝利判定
  IF v_forfeited THEN
    SELECT COUNT(*) INTO v_alive_cnt
      FROM public.players
      WHERE game_id = v_player.game_id AND is_alive = true;

    IF v_alive_cnt <= 1 THEN
      SELECT id INTO v_winner_id
        FROM public.players
        WHERE game_id = v_player.game_id AND is_alive = true
        LIMIT 1;

      UPDATE public.games
        SET status      = 'finished',
            finished_at = now(),
            winner_id   = v_winner_id
        WHERE id = v_player.game_id;
    END IF;
  END IF;

  RETURN json_build_object('ok', true, 'forfeited', v_forfeited);
END;
$$;

-- anon / authenticated どちらからも呼べるようにする
-- （device_id 検証が内部にあるため安全）
REVOKE ALL ON FUNCTION public.mark_player_seen FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_player_seen TO anon, authenticated, service_role;
