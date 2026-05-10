-- Weasel-Airsoft: PostgreSQL RPC Functions
-- Run AFTER schema.sql AND migrations/001_game_balance.sql

-- ─── register_hit ──────────────────────────────────────────────────────────────
-- ヒット登録を単一トランザクションで原子的に実行する。
--
-- 設計ポイント:
--   - game 行を FOR UPDATE でロック → status + hit_damage を安全に読む
--   - target 行を FOR UPDATE でロック → 同時ヒット時もデータ競合しない
--   - p_damage パラメータを廃止し、games.hit_damage をそのまま使用
--   - UPDATE後の is_alive を集計して勝利判定（スタールな事前リストを使わない）

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
  v_game       RECORD;
  v_shooter    RECORD;
  v_target     RECORD;
  v_new_hp     INT;
  v_alive_cnt  INT;
  v_winner_id  UUID;
BEGIN
  -- 1. ゲーム行を排他ロック取得 + status / hit_damage 確認
  SELECT * INTO v_game
    FROM public.games
    WHERE id = p_game_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'GAME_NOT_FOUND';
  END IF;
  IF v_game.status <> 'active' THEN
    RAISE EXCEPTION 'GAME_NOT_ACTIVE';
  END IF;

  -- 2. 射撃者の検証
  SELECT * INTO v_shooter
    FROM public.players
    WHERE id = p_shooter_id AND game_id = p_game_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SHOOTER_NOT_FOUND';
  END IF;
  IF v_shooter.device_id <> p_shooter_device_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;
  IF NOT v_shooter.is_alive THEN
    RAISE EXCEPTION 'SHOOTER_DEAD';
  END IF;

  -- 3. ターゲット行を排他ロック取得
  SELECT * INTO v_target
    FROM public.players
    WHERE qr_code_id = p_target_qr_id AND game_id = p_game_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TARGET_NOT_FOUND';
  END IF;
  IF NOT v_target.is_alive THEN
    RETURN json_build_object('newHp', 0, 'gameOver', false);
  END IF;
  IF v_target.id = p_shooter_id THEN
    RAISE EXCEPTION 'SELF_SHOT';
  END IF;

  -- 4. games.hit_damage を使って原子的 HP 更新
  v_new_hp := GREATEST(0, v_target.hp - v_game.hit_damage);

  UPDATE public.players
    SET hp       = v_new_hp,
        is_alive = (v_new_hp > 0)
    WHERE id = v_target.id;

  -- 5. 最新の生存者数を再取得（UPDATE後の確定値）
  SELECT COUNT(*) INTO v_alive_cnt
    FROM public.players
    WHERE game_id = p_game_id AND is_alive = true;

  -- 6. 勝利判定
  IF v_alive_cnt <= 1 THEN
    SELECT id INTO v_winner_id
      FROM public.players
      WHERE game_id = p_game_id AND is_alive = true
      LIMIT 1;

    UPDATE public.games
      SET status      = 'finished',
          finished_at = now(),
          winner_id   = v_winner_id
      WHERE id = p_game_id;

    RETURN json_build_object(
      'newHp',    v_new_hp,
      'gameOver', true,
      'winnerId', v_winner_id
    );
  END IF;

  RETURN json_build_object(
    'newHp',    v_new_hp,
    'gameOver', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.register_hit FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_hit TO service_role;
