-- ── 013: 青鬼（aoni）モード ────────────────────────────────────────────────────

-- ① GameMode に 'aoni' を追加
ALTER TABLE public.games
  DROP CONSTRAINT IF EXISTS games_game_mode_check;
ALTER TABLE public.games
  ADD CONSTRAINT games_game_mode_check
  CHECK (game_mode IN ('deathmatch','battle','survival','tactics','traitor','aoni'));

-- ② winner_team に 'player' / 'npc' を追加
ALTER TABLE public.games
  DROP CONSTRAINT IF EXISTS games_winner_team_check;
ALTER TABLE public.games
  ADD CONSTRAINT games_winner_team_check
  CHECK (winner_team IS NULL OR winner_team IN
    ('red','blue','crew','traitor','hunter','survivor','player','npc'));

-- ③ game_objectives に 'seal' タイプ + seal_index を追加
ALTER TABLE public.game_objectives
  DROP CONSTRAINT IF EXISTS game_objectives_type_check;
ALTER TABLE public.game_objectives
  ADD CONSTRAINT game_objectives_type_check
  CHECK (type IN ('generator','item','control_point','medkit','damage_boost','seal'));

ALTER TABLE public.game_objectives
  ADD COLUMN IF NOT EXISTS seal_index integer;  -- 1〜5

-- ④ players に NPC 攻撃クールダウン列を追加
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS npc_attack_last_at timestamptz;

-- ⑤ game_npcs テーブル（1ゲーム1NPC）
CREATE TABLE IF NOT EXISTS public.game_npcs (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id               uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,

  -- HP
  hp                    integer NOT NULL DEFAULT 300 CHECK (hp >= 0),
  max_hp                integer NOT NULL DEFAULT 300,

  -- 位置・向き
  lat                   float,
  lng                   float,
  heading               float NOT NULL DEFAULT 0,      -- 0=北、時計回り

  -- 移動パラメータ
  speed_mps             float NOT NULL DEFAULT 1.5,

  -- ロックオン状態
  lockon_target_id      uuid REFERENCES public.players(id) ON DELETE SET NULL,
  lockon_start_at       timestamptz,
  lockon_seconds        float NOT NULL DEFAULT 2.0,
  catch_range_m         float NOT NULL DEFAULT 10.0,

  -- ランジ状態
  lunge_armed_at        timestamptz,
  lunge_fire_at         timestamptz,
  last_lunge_at         timestamptz,
  lunge_interval_s      integer NOT NULL DEFAULT 30,
  lunge_radius_m        float NOT NULL DEFAULT 5.0,

  -- スタン（背後攻撃）
  stun_until            timestamptz,
  -- 混乱（ロックオン逃げ切り）
  confused_until        timestamptz,

  -- コントローラー（NPC を動かしているクライアント）
  controller_id         uuid REFERENCES public.players(id) ON DELETE SET NULL,
  controller_heartbeat  timestamptz,

  UNIQUE (game_id)
);

ALTER TABLE public.game_npcs REPLICA IDENTITY FULL;

ALTER TABLE public.game_npcs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_npcs: public read"
  ON public.game_npcs FOR SELECT USING (true);
-- INSERT / UPDATE / DELETE: service role (Server Action) のみ

CREATE INDEX IF NOT EXISTS game_npcs_game_id_idx ON public.game_npcs (game_id);
