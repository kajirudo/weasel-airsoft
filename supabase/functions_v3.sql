-- Weasel-Airsoft: RPC Functions v3
-- Migration 006 適用後に実行してください。
-- v2 の register_hit + finish_game_by_timeout を置き換えます。

-- ─── register_hit (v3) ────────────────────────────────────────────────────────
-- 変更点（v2 → v3）:
--   - team_mode 時の友軍誤射ブロック
--   - キル時に killer_name を victim 行に記録（キルフィード用）
--   - チームモードの勝利判定（どちらかのチームが全滅で終了）

CREATE OR REPLACE FUNCTION public.register_hit(
  p_game_id           UUID,
  p_shooter_id        UUID,
  p_shooter_device_id TEXT,
  p_target_qr_id      TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game        RECORD;
  v_shooter     RECORD;
  v_target      RECORD;
  v_new_hp      INT;
  v_alive_cnt   INT;
  v_winner_id   UUID;
  v_red_alive   INT;
  v_blue_alive  INT;
  v_winner_team TEXT;
BEGIN
  -- 1. ゲーム行を排他ロック
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND                   THEN RAISE EXCEPTION 'GAME_NOT_FOUND'; END IF;
  IF v_game.status <> 'active'   THEN RAISE EXCEPTION 'GAME_NOT_ACTIVE'; END IF;

  -- 2. 射撃者の検証
  SELECT * INTO v_shooter FROM public.players WHERE id = p_shooter_id AND game_id = p_game_id;
  IF NOT FOUND                              THEN RAISE EXCEPTION 'SHOOTER_NOT_FOUND'; END IF;
  IF v_shooter.device_id <> p_shooter_device_id THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF NOT v_shooter.is_alive                 THEN RAISE EXCEPTION 'SHOOTER_DEAD'; END IF;

  -- 2b. サーバーサイドクールダウン
  IF v_shooter.last_shot_at IS NOT NULL AND
     now() - v_shooter.last_shot_at < v_game.shoot_cooldown * interval '1 millisecond' THEN
    RETURN json_build_object('newHp', -1, 'throttled', true, 'gameOver', false);
  END IF;

  -- 2c. last_shot_at を更新
  UPDATE public.players SET last_shot_at = now() WHERE id = p_shooter_id;

  -- 3. ターゲット行を排他ロック
  SELECT * INTO v_target
    FROM public.players WHERE qr_code_id = p_target_qr_id AND game_id = p_game_id
    FOR UPDATE;
  IF NOT FOUND         THEN RAISE EXCEPTION 'TARGET_NOT_FOUND'; END IF;
  IF NOT v_target.is_alive THEN RETURN json_build_object('newHp', 0, 'gameOver', false); END IF;
  IF v_target.id = p_shooter_id THEN RAISE EXCEPTION 'SELF_SHOT'; END IF;

  -- 3b. チームモード：友軍誤射ブロック
  IF v_game.team_mode AND
     v_shooter.team <> 'none' AND
     v_shooter.team = v_target.team THEN
    RAISE EXCEPTION 'FRIENDLY_FIRE';
  END IF;

  -- 4. HP 更新（killer_name をキル時に記録）
  v_new_hp := GREATEST(0, v_target.hp - v_game.hit_damage);

  UPDATE public.players
    SET hp          = v_new_hp,
        is_alive    = (v_new_hp > 0),
        killer_name = CASE WHEN v_new_hp = 0 THEN v_shooter.name ELSE killer_name END
    WHERE id = v_target.id;

  -- 4b. キル時はシューターの kills をインクリメント
  IF v_new_hp = 0 THEN
    UPDATE public.players SET kills = kills + 1 WHERE id = p_shooter_id;
  END IF;

  -- 5. 勝利判定（チームモードと FFA で分岐）
  IF v_game.team_mode THEN
    SELECT COUNT(*) INTO v_red_alive
      FROM public.players WHERE game_id = p_game_id AND team = 'red'  AND is_alive = true;
    SELECT COUNT(*) INTO v_blue_alive
      FROM public.players WHERE game_id = p_game_id AND team = 'blue' AND is_alive = true;

    IF v_red_alive = 0 OR v_blue_alive = 0 THEN
      v_winner_team := CASE WHEN v_red_alive > 0 THEN 'red' ELSE 'blue' END;
      UPDATE public.games
        SET status = 'finished', finished_at = now(), winner_team = v_winner_team
        WHERE id = p_game_id;
      RETURN json_build_object(
        'newHp', v_new_hp, 'gameOver', true, 'winnerTeam', v_winner_team
      );
    END IF;

  ELSE
    SELECT COUNT(*) INTO v_alive_cnt
      FROM public.players WHERE game_id = p_game_id AND is_alive = true;

    IF v_alive_cnt <= 1 THEN
      SELECT id INTO v_winner_id
        FROM public.players WHERE game_id = p_game_id AND is_alive = true LIMIT 1;
      UPDATE public.games
        SET status = 'finished', finished_at = now(), winner_id = v_winner_id
        WHERE id = p_game_id;
      RETURN json_build_object(
        'newHp', v_new_hp, 'gameOver', true, 'winnerId', v_winner_id
      );
    END IF;
  END IF;

  RETURN json_build_object('newHp', v_new_hp, 'gameOver', false);
END;
$$;

REVOKE ALL ON FUNCTION public.register_hit FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_hit TO service_role;


-- ─── finish_game_by_timeout (v3) ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.finish_game_by_timeout(p_game_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game        RECORD;
  v_max_hp      INT;
  v_top_count   INT;
  v_winner_id   UUID;
  v_red_hp      INT;
  v_blue_hp     INT;
  v_winner_team TEXT;
BEGIN
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND OR v_game.status <> 'active' THEN
    RETURN json_build_object('skipped', true);
  END IF;

  IF v_game.team_mode THEN
    -- チームモード：合計 HP が多いチームの勝利
    SELECT COALESCE(SUM(hp), 0) INTO v_red_hp
      FROM public.players WHERE game_id = p_game_id AND team = 'red' AND is_alive = true;
    SELECT COALESCE(SUM(hp), 0) INTO v_blue_hp
      FROM public.players WHERE game_id = p_game_id AND team = 'blue' AND is_alive = true;

    IF v_red_hp > v_blue_hp THEN
      v_winner_team := 'red';
    ELSIF v_blue_hp > v_red_hp THEN
      v_winner_team := 'blue';
    -- 同率は引き分け（winner_team = NULL のまま）
    END IF;

    UPDATE public.games
      SET status = 'finished', finished_at = now(), winner_team = v_winner_team
      WHERE id = p_game_id;

    RETURN json_build_object('skipped', false, 'winnerTeam', v_winner_team);

  ELSE
    -- FFA：最高 HP の単独プレイヤーが勝者
    SELECT MAX(hp) INTO v_max_hp
      FROM public.players WHERE game_id = p_game_id AND is_alive = true;
    SELECT COUNT(*) INTO v_top_count
      FROM public.players WHERE game_id = p_game_id AND is_alive = true AND hp = v_max_hp;

    IF v_top_count = 1 THEN
      SELECT id INTO v_winner_id
        FROM public.players WHERE game_id = p_game_id AND is_alive = true AND hp = v_max_hp LIMIT 1;
    END IF;

    UPDATE public.games
      SET status = 'finished', finished_at = now(), winner_id = v_winner_id
      WHERE id = p_game_id;

    RETURN json_build_object('skipped', false, 'winnerId', v_winner_id);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.finish_game_by_timeout FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finish_game_by_timeout TO service_role;
