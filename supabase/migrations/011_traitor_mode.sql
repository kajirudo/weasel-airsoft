-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 011: Traitor モード (Among Us 型 心理戦)
-- ══════════════════════════════════════════════════════════════════════════════

-- ── games: traitor 設定 + 集会 + 妨害 ────────────────────────────────────────
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS traitor_count   int         NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS sheriff_enabled boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS task_goal       int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS task_done       int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meeting_id      uuid,          -- 進行中の集会ID (null=なし)
  ADD COLUMN IF NOT EXISTS meeting_until   timestamptz,   -- 集会終了時刻
  ADD COLUMN IF NOT EXISTS sabotage_type   text,          -- 'comms'|null
  ADD COLUMN IF NOT EXISTS sabotage_until  timestamptz;   -- 妨害終了時刻

-- game_mode に 'traitor' を追加
ALTER TABLE public.games DROP CONSTRAINT IF EXISTS games_game_mode_check;
ALTER TABLE public.games ADD CONSTRAINT games_game_mode_check
  CHECK (game_mode IN ('battle','survival','tactics','traitor'));

-- ── players: role2 (crew/traitor/sheriff) + タスク + 集会権 ────────────────
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS role2           text    NOT NULL DEFAULT 'crew'
    CHECK (role2 IN ('crew','traitor','sheriff')),
  ADD COLUMN IF NOT EXISTS tasks_done      int     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meeting_uses    int     NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS investigate_uses int    NOT NULL DEFAULT 0;

-- ── traitor_votes: 集会ごとの投票 ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.traitor_votes (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id     uuid        NOT NULL REFERENCES public.games(id)   ON DELETE CASCADE,
  meeting_id  uuid        NOT NULL,                               -- games.meeting_id のスナップショット
  voter_id    uuid        NOT NULL REFERENCES public.players(id),
  target_id   uuid        REFERENCES public.players(id),          -- null = スキップ
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, voter_id)                                   -- 1集会につき1票
);

ALTER TABLE public.traitor_votes REPLICA IDENTITY FULL;
CREATE INDEX IF NOT EXISTS idx_traitor_votes_meeting ON public.traitor_votes (meeting_id);
ALTER TABLE public.traitor_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "votes: public read"   ON public.traitor_votes FOR SELECT USING (true);
CREATE POLICY "votes: service write" ON public.traitor_votes FOR INSERT WITH CHECK (true);
CREATE POLICY "votes: service update" ON public.traitor_votes FOR UPDATE USING (true);

-- ══════════════════════════════════════════════════════════════════════════════
-- register_hit RPC: traitor モード対応版（勝利判定 + 同陣営撃ち防止）
-- ══════════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.register_hit(uuid, uuid, text, text);

CREATE OR REPLACE FUNCTION public.register_hit(
  p_game_id           uuid,
  p_shooter_id        uuid,
  p_shooter_device_id text,
  p_target_qr_id      text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_game          public.games%ROWTYPE;
  v_shooter       public.players%ROWTYPE;
  v_target        public.players%ROWTYPE;
  v_now           timestamptz := now();
  v_damage        integer;
  v_new_hp        integer;
  v_game_over     boolean := false;
  v_alive_count   integer;
  v_traitor_alive integer;
  v_crew_alive    integer;
  v_winner_id     uuid;
  v_winner_team   text;
BEGIN
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND OR v_game.status <> 'active' THEN
    RAISE EXCEPTION 'GAME_NOT_ACTIVE';
  END IF;

  SELECT * INTO v_shooter FROM public.players
    WHERE id = p_shooter_id AND game_id = p_game_id AND device_id = p_shooter_device_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_SHOOTER'; END IF;
  IF NOT v_shooter.is_alive THEN RAISE EXCEPTION 'SHOOTER_DEAD'; END IF;
  IF v_shooter.qr_code_id = p_target_qr_id THEN RAISE EXCEPTION 'SELF_SHOT'; END IF;

  -- 集会中は射撃不可
  IF v_game.meeting_id IS NOT NULL THEN
    RAISE EXCEPTION 'MEETING_IN_PROGRESS';
  END IF;

  SELECT * INTO v_target FROM public.players
    WHERE game_id = p_game_id AND qr_code_id = p_target_qr_id AND is_alive = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('newHp',0,'gameOver',false,'throttled',true);
  END IF;

  -- Traitor モード: Traitor 同士は撃てない
  IF v_game.game_mode = 'traitor' THEN
    IF v_shooter.role2 = 'traitor' AND v_target.role2 = 'traitor' THEN
      RAISE EXCEPTION 'FRIENDLY_FIRE';
    END IF;
  END IF;

  -- 通常チームモードのフレンドリーファイア
  IF v_game.game_mode <> 'traitor' AND v_game.team_mode
     AND v_shooter.team = v_target.team AND v_shooter.team <> 'none' THEN
    RAISE EXCEPTION 'FRIENDLY_FIRE';
  END IF;

  -- サバイバルモード: 同ロール同士は撃てない
  IF v_game.game_mode = 'survival' THEN
    IF v_shooter.role = v_target.role THEN RAISE EXCEPTION 'FRIENDLY_FIRE'; END IF;
  END IF;

  -- クールダウン
  IF v_shooter.last_shot_at IS NOT NULL
     AND EXTRACT(EPOCH FROM (v_now - v_shooter.last_shot_at)) * 1000 < v_game.shoot_cooldown THEN
    RETURN jsonb_build_object('newHp',v_target.hp,'gameOver',false,'throttled',true);
  END IF;

  -- ダメージ計算
  v_damage := v_game.hit_damage;
  IF v_shooter.damage_boost THEN
    v_damage := v_damage * 2;
    UPDATE public.players SET damage_boost = false WHERE id = v_shooter.id;
  END IF;

  v_new_hp := GREATEST(0, v_target.hp - v_damage);

  UPDATE public.players SET
    hp          = v_new_hp,
    is_alive    = (v_new_hp > 0),
    killer_name = CASE WHEN v_new_hp = 0 THEN v_shooter.name ELSE killer_name END,
    kills       = CASE WHEN v_new_hp = 0 THEN v_shooter.kills + 0 ELSE v_shooter.kills END
  WHERE id = v_target.id;

  UPDATE public.players SET last_shot_at = v_now WHERE id = v_shooter.id;

  -- 勝利判定（HP 0 時）
  IF v_new_hp = 0 THEN
    IF v_game.game_mode = 'traitor' THEN
      SELECT COUNT(*) INTO v_traitor_alive FROM public.players
        WHERE game_id = p_game_id AND is_alive = true AND role2 = 'traitor';
      SELECT COUNT(*) INTO v_crew_alive FROM public.players
        WHERE game_id = p_game_id AND is_alive = true AND role2 <> 'traitor';
      IF v_traitor_alive = 0 THEN
        v_game_over := true; v_winner_team := 'crew';
      ELSIF v_traitor_alive >= v_crew_alive THEN
        v_game_over := true; v_winner_team := 'traitor';
      END IF;

    ELSIF v_game.game_mode = 'survival' THEN
      IF v_target.role = 'hunter' THEN
        v_game_over := true; v_winner_team := 'survivor';
      ELSE
        SELECT COUNT(*) INTO v_alive_count FROM public.players
          WHERE game_id = p_game_id AND is_alive = true AND role = 'survivor';
        IF v_alive_count = 0 THEN
          v_game_over := true; v_winner_team := 'hunter';
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
        status = 'finished', finished_at = v_now,
        winner_id = v_winner_id, winner_team = v_winner_team
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
-- finish_game_by_timeout: traitor モード対応
-- ══════════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.finish_game_by_timeout(uuid);

CREATE OR REPLACE FUNCTION public.finish_game_by_timeout(p_game_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_game    public.games%ROWTYPE;
  v_winner  text;
  v_now     timestamptz := now();
  v_pt_red  integer := 0;
  v_pt_blue integer := 0;
  v_obj     RECORD;
  v_secs    float8;
BEGIN
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND OR v_game.status <> 'active' THEN RETURN; END IF;

  IF v_game.game_mode = 'traitor' THEN
    -- task_goal = 0（GPS なし）は常に Traitor 勝利
    -- task_goal > 0 かつ task_done >= task_goal なら Crew 勝利（通常は game 中に決まる）
    v_winner := CASE
      WHEN v_game.task_goal > 0 AND v_game.task_done >= v_game.task_goal THEN 'crew'
      ELSE 'traitor'
    END;
    UPDATE public.games SET
      status = 'finished', finished_at = v_now, winner_team = v_winner
    WHERE id = p_game_id;

  ELSIF v_game.game_mode = 'tactics' THEN
    FOR v_obj IN
      SELECT controlled_by, control_since FROM public.game_objectives
        WHERE game_id = p_game_id AND type = 'control_point'
          AND controlled_by <> 'none' AND control_since IS NOT NULL
    LOOP
      v_secs := EXTRACT(EPOCH FROM (v_now - v_obj.control_since));
      IF v_obj.controlled_by = 'red'  THEN v_pt_red  := v_pt_red  + FLOOR(v_secs/10)::int;
      ELSIF v_obj.controlled_by = 'blue' THEN v_pt_blue := v_pt_blue + FLOOR(v_secs/10)::int;
      END IF;
    END LOOP;
    v_winner := CASE
      WHEN (v_game.score_red+v_pt_red) > (v_game.score_blue+v_pt_blue) THEN 'red'
      WHEN (v_game.score_blue+v_pt_blue) > (v_game.score_red+v_pt_red) THEN 'blue'
      ELSE NULL END;
    UPDATE public.games SET
      status='finished', finished_at=v_now,
      score_red=score_red+v_pt_red, score_blue=score_blue+v_pt_blue, winner_team=v_winner
    WHERE id=p_game_id;

  ELSE
    UPDATE public.games SET status='finished', finished_at=v_now WHERE id=p_game_id;
  END IF;
END;
$$;
