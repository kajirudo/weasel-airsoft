-- Weasel-Airsoft: PostgreSQL RPC Functions v2
-- Migration 004 を適用後にこのファイルを実行してください。
-- 既存の register_hit を置き換え、finish_game_by_timeout を追加します。

-- ─── register_hit (v2) ────────────────────────────────────────────────────────
-- 変更点:
--   - サーバーサイドショットクールダウンチェック（last_shot_at）
--   - ターゲット撃破時に shooter.kills をインクリメント
--   - last_shot_at を更新して次回のチェックに使用

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
  -- 1. ゲーム行を排他ロック取得 + status / hit_damage / shoot_cooldown 確認
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

  -- 2b. サーバーサイドクールダウンチェック（改ざん対策）
  IF v_shooter.last_shot_at IS NOT NULL AND
     now() - v_shooter.last_shot_at < v_game.shoot_cooldown * interval '1 millisecond' THEN
    -- クライアント側でも制御しているが念のため黙って無視
    RETURN json_build_object('newHp', -1, 'throttled', true, 'gameOver', false);
  END IF;

  -- 2c. last_shot_at を今すぐ更新（ターゲット処理前に記録）
  UPDATE public.players
    SET last_shot_at = now()
    WHERE id = p_shooter_id;

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

  -- 4. HP 更新
  v_new_hp := GREATEST(0, v_target.hp - v_game.hit_damage);

  UPDATE public.players
    SET hp       = v_new_hp,
        is_alive = (v_new_hp > 0)
    WHERE id = v_target.id;

  -- 4b. ターゲット撃破時にシューターのキル数をインクリメント
  IF v_new_hp = 0 THEN
    UPDATE public.players
      SET kills = kills + 1
      WHERE id = p_shooter_id;
  END IF;

  -- 5. 生存者数を再取得
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


-- ─── finish_game_by_timeout ──────────────────────────────────────────────────
-- タイマー切れ時にゲームを終了する。
-- 最高HP を持つプレイヤーが勝者（同率の場合は引き分け = winner_id NULL）。
-- すでに finished なら何もしない（冪等）。

CREATE OR REPLACE FUNCTION public.finish_game_by_timeout(p_game_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game      RECORD;
  v_max_hp    INT;
  v_top_count INT;
  v_winner_id UUID;
BEGIN
  SELECT * INTO v_game
    FROM public.games
    WHERE id = p_game_id
    FOR UPDATE;

  IF NOT FOUND OR v_game.status <> 'active' THEN
    RETURN json_build_object('skipped', true);
  END IF;

  -- 生存者の最高HP を取得
  SELECT MAX(hp) INTO v_max_hp
    FROM public.players
    WHERE game_id = p_game_id AND is_alive = true;

  -- 同率トップが何人いるか
  SELECT COUNT(*) INTO v_top_count
    FROM public.players
    WHERE game_id = p_game_id AND is_alive = true AND hp = v_max_hp;

  -- 単独トップのみ勝者とする（同率 = 引き分け）
  IF v_top_count = 1 THEN
    SELECT id INTO v_winner_id
      FROM public.players
      WHERE game_id = p_game_id AND is_alive = true AND hp = v_max_hp
      LIMIT 1;
  END IF;

  UPDATE public.games
    SET status      = 'finished',
        finished_at = now(),
        winner_id   = v_winner_id
    WHERE id = p_game_id;

  RETURN json_build_object('skipped', false, 'winnerId', v_winner_id);
END;
$$;

REVOKE ALL ON FUNCTION public.finish_game_by_timeout FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finish_game_by_timeout TO service_role;
