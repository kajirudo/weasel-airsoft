-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 010: 3 game modes (battle / survival / tactics)
-- ══════════════════════════════════════════════════════════════════════════════

-- ── games: ゲームモード + ストーム + タクティクススコア ────────────────────────
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS game_mode        text    NOT NULL DEFAULT 'battle'
    CHECK (game_mode IN ('battle','survival','tactics')),
  ADD COLUMN IF NOT EXISTS storm_center_lat double precision,
  ADD COLUMN IF NOT EXISTS storm_center_lng double precision,
  ADD COLUMN IF NOT EXISTS storm_radius_m   integer NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS storm_final_m    integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS score_red        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS score_blue       integer NOT NULL DEFAULT 0;

-- ── players: 役割 + ダメージブースト ──────────────────────────────────────────
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS role         text    NOT NULL DEFAULT 'survivor'
    CHECK (role IN ('survivor','hunter')),
  ADD COLUMN IF NOT EXISTS damage_boost boolean NOT NULL DEFAULT false;

-- ── game_objectives: GPS バーチャルマーカー ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.game_objectives (
  id             uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id        uuid        NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  lat            double precision NOT NULL,
  lng            double precision NOT NULL,
  type           text        NOT NULL
    CHECK (type IN ('medkit','damage_boost','generator','control_point')),

  -- アイテム共通（medkit / damage_boost）
  is_claimed     boolean     NOT NULL DEFAULT false,
  claimed_by     uuid        REFERENCES public.players(id),

  -- 発電機専用（generator）
  is_activated   boolean     NOT NULL DEFAULT false,
  activate_start timestamptz,          -- 起動開始時刻（10秒後に completeGenerator で確定）
  activating_by  uuid        REFERENCES public.players(id),

  -- 拠点専用（control_point）
  controlled_by  text        NOT NULL DEFAULT 'none'
    CHECK (controlled_by IN ('red','blue','none')),
  control_since  timestamptz,          -- 現在の占領開始時刻（スコア計算用）
  capture_start  timestamptz,          -- 占領プロセス開始時刻（5秒後に completeCapture で確定）
  capturing_team text        CHECK (capturing_team IN ('red','blue')),

  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.game_objectives REPLICA IDENTITY FULL;
CREATE INDEX IF NOT EXISTS idx_game_objectives_game ON public.game_objectives (game_id);
ALTER TABLE public.game_objectives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "objectives: public read"
  ON public.game_objectives FOR SELECT USING (true);
CREATE POLICY "objectives: service insert"
  ON public.game_objectives FOR INSERT WITH CHECK (true);
CREATE POLICY "objectives: service update"
  ON public.game_objectives FOR UPDATE USING (true);

-- ══════════════════════════════════════════════════════════════════════════════
-- register_hit RPC: damage_boost + サバイバルモード対応版
-- ══════════════════════════════════════════════════════════════════════════════
-- 戻り値の型が変わるため既存関数を先に削除する
DROP FUNCTION IF EXISTS public.register_hit(uuid, uuid, text, text);

CREATE OR REPLACE FUNCTION public.register_hit(
  p_game_id           uuid,
  p_shooter_id        uuid,
  p_shooter_device_id text,
  p_target_qr_id      text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_game        public.games%ROWTYPE;
  v_shooter     public.players%ROWTYPE;
  v_target      public.players%ROWTYPE;
  v_now         timestamptz := now();
  v_damage      integer;
  v_new_hp      integer;
  v_game_over   boolean := false;
  v_alive_count integer;
  v_winner_id   uuid;
  v_winner_team text;
BEGIN
  -- ゲーム取得（行ロック）
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND OR v_game.status <> 'active' THEN
    RAISE EXCEPTION 'GAME_NOT_ACTIVE';
  END IF;

  -- 射手取得・検証
  SELECT * INTO v_shooter FROM public.players
    WHERE id = p_shooter_id AND game_id = p_game_id AND device_id = p_shooter_device_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_SHOOTER'; END IF;
  IF NOT v_shooter.is_alive THEN RAISE EXCEPTION 'SHOOTER_DEAD'; END IF;
  IF v_shooter.qr_code_id = p_target_qr_id THEN RAISE EXCEPTION 'SELF_SHOT'; END IF;

  -- ターゲット取得
  SELECT * INTO v_target FROM public.players
    WHERE game_id = p_game_id AND qr_code_id = p_target_qr_id AND is_alive = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('newHp',0,'gameOver',false,'throttled',true);
  END IF;

  -- フレンドリーファイアチェック（通常チームモード）
  IF v_game.team_mode
     AND v_shooter.team = v_target.team
     AND v_shooter.team <> 'none' THEN
    RAISE EXCEPTION 'FRIENDLY_FIRE';
  END IF;

  -- サバイバルモード: Hunter↔Survivor 間のみ攻撃可
  IF v_game.game_mode = 'survival' THEN
    IF v_shooter.role = v_target.role THEN
      RAISE EXCEPTION 'FRIENDLY_FIRE';
    END IF;
  END IF;

  -- クールダウンチェック
  IF v_shooter.last_shot_at IS NOT NULL
     AND EXTRACT(EPOCH FROM (v_now - v_shooter.last_shot_at)) * 1000 < v_game.shoot_cooldown THEN
    RETURN jsonb_build_object('newHp',v_target.hp,'gameOver',false,'throttled',true);
  END IF;

  -- ダメージ計算（damage_boost 2× 対応）
  v_damage := v_game.hit_damage;
  IF v_shooter.damage_boost THEN
    v_damage := v_damage * 2;
    UPDATE public.players SET damage_boost = false WHERE id = v_shooter.id;
  END IF;

  v_new_hp := GREATEST(0, v_target.hp - v_damage);

  -- ターゲット HP 更新
  UPDATE public.players SET
    hp          = v_new_hp,
    is_alive    = (v_new_hp > 0),
    killer_name = CASE WHEN v_new_hp = 0 THEN v_shooter.name ELSE killer_name END
  WHERE id = v_target.id;

  -- 射手 last_shot_at 更新
  UPDATE public.players SET last_shot_at = v_now WHERE id = v_shooter.id;

  -- 勝利判定（HP 0 時のみ）
  IF v_new_hp = 0 THEN
    IF v_game.game_mode = 'survival' THEN
      -- Hunter 撃破 → Survivor 勝利
      IF v_target.role = 'hunter' THEN
        v_game_over := true;
        v_winner_team := 'survivor';
      ELSE
        -- 残存 Survivor チェック
        SELECT COUNT(*) INTO v_alive_count FROM public.players
          WHERE game_id = p_game_id AND is_alive = true AND role = 'survivor';
        IF v_alive_count = 0 THEN
          v_game_over := true;
          v_winner_team := 'hunter';
        END IF;
      END IF;
    ELSIF v_game.team_mode THEN
      SELECT COUNT(*) INTO v_alive_count FROM public.players
        WHERE game_id = p_game_id AND is_alive = true AND team = v_target.team;
      IF v_alive_count = 0 THEN
        v_game_over := true;
        v_winner_team := CASE WHEN v_target.team = 'red' THEN 'blue' ELSE 'red' END;
      END IF;
    ELSE
      SELECT COUNT(*) INTO v_alive_count FROM public.players
        WHERE game_id = p_game_id AND is_alive = true;
      IF v_alive_count = 1 THEN
        SELECT id INTO v_winner_id FROM public.players
          WHERE game_id = p_game_id AND is_alive = true;
        v_game_over := true;
      END IF;
    END IF;

    IF v_game_over THEN
      UPDATE public.games SET
        status      = 'finished',
        finished_at = v_now,
        winner_id   = v_winner_id,
        winner_team = v_winner_team
      WHERE id = p_game_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'newHp',      v_new_hp,
    'gameOver',   v_game_over,
    'winnerId',   v_winner_id,
    'winnerTeam', v_winner_team,
    'throttled',  false
  );
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- finish_game_by_timeout: tactics モードのスコア集計に対応
-- ══════════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.finish_game_by_timeout(uuid);

CREATE OR REPLACE FUNCTION public.finish_game_by_timeout(p_game_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_game      public.games%ROWTYPE;
  v_winner    text;
  v_now       timestamptz := now();
  v_pt_red    integer := 0;
  v_pt_blue   integer := 0;
  v_obj       RECORD;
  v_secs      float8;
BEGIN
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND OR v_game.status <> 'active' THEN RETURN; END IF;

  -- タクティクスモード: 現在占領中の拠点のスコアを加算
  IF v_game.game_mode = 'tactics' THEN
    FOR v_obj IN
      SELECT controlled_by, control_since
        FROM public.game_objectives
        WHERE game_id = p_game_id AND type = 'control_point'
          AND controlled_by <> 'none' AND control_since IS NOT NULL
    LOOP
      v_secs := EXTRACT(EPOCH FROM (v_now - v_obj.control_since));
      IF v_obj.controlled_by = 'red'  THEN v_pt_red  := v_pt_red  + FLOOR(v_secs / 10)::integer;
      ELSIF v_obj.controlled_by = 'blue' THEN v_pt_blue := v_pt_blue + FLOOR(v_secs / 10)::integer;
      END IF;
    END LOOP;

    v_winner := CASE
      WHEN (v_game.score_red + v_pt_red) > (v_game.score_blue + v_pt_blue) THEN 'red'
      WHEN (v_game.score_blue + v_pt_blue) > (v_game.score_red + v_pt_red)  THEN 'blue'
      ELSE NULL
    END;

    UPDATE public.games SET
      status      = 'finished',
      finished_at = v_now,
      score_red   = score_red  + v_pt_red,
      score_blue  = score_blue + v_pt_blue,
      winner_team = v_winner
    WHERE id = p_game_id;
  ELSE
    -- 通常終了（HP 最大のプレイヤー or チームが勝利）
    UPDATE public.games SET status = 'finished', finished_at = v_now
      WHERE id = p_game_id;
  END IF;
END;
$$;
