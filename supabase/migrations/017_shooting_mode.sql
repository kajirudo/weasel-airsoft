-- ── 017: シューティングモード ────────────────────────────────────────────────

-- ① GameMode CHECK 制約に 'shooting' を追加
ALTER TABLE public.games
  DROP CONSTRAINT IF EXISTS games_game_mode_check;
ALTER TABLE public.games
  ADD CONSTRAINT games_game_mode_check
  CHECK (game_mode IN ('deathmatch','battle','survival','tactics','traitor','hunting','shooting'));

-- ② games: 環境設定・同時アクティブ上限
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS shooting_environment text
    CHECK (shooting_environment IS NULL OR shooting_environment IN ('indoor','outdoor'));
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS shooting_max_active integer NOT NULL DEFAULT 3;

-- ③ players: スコア / 弾倉 / 固定位置
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS shooting_score        integer    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shooting_combo        integer    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shooting_max_combo    integer    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shooting_misses       integer    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shooting_ammo         integer    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shooting_reload_until timestamptz,
  ADD COLUMN IF NOT EXISTS base_lat              double precision,
  ADD COLUMN IF NOT EXISTS base_lng              double precision;

-- ④ ターゲット種別 enum
DO $$ BEGIN
  CREATE TYPE shooting_target_kind AS ENUM ('standard','tough','tiny','runner','bonus');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ⑤ shooting_targets テーブル
CREATE TABLE IF NOT EXISTS public.shooting_targets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id         uuid NOT NULL REFERENCES public.games(id)   ON DELETE CASCADE,
  owner_player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  kind            shooting_target_kind NOT NULL DEFAULT 'standard',
  bearing_deg     real NOT NULL,
  dist_m          real NOT NULL,
  drift_dps       real NOT NULL DEFAULT 0,
  size_factor     real NOT NULL DEFAULT 1.0,
  hp              integer NOT NULL DEFAULT 1 CHECK (hp >= 0),
  max_hp          integer NOT NULL DEFAULT 1,
  base_score      integer NOT NULL DEFAULT 100,
  spawn_at        timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  killed_at       timestamptz,
  killed_by       uuid REFERENCES public.players(id) ON DELETE SET NULL,
  travel_ms       integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS shooting_targets_owner_alive_idx
  ON public.shooting_targets (game_id, owner_player_id)
  WHERE killed_at IS NULL;
CREATE INDEX IF NOT EXISTS shooting_targets_game_idx
  ON public.shooting_targets (game_id);

ALTER TABLE public.shooting_targets REPLICA IDENTITY FULL;

ALTER TABLE public.shooting_targets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shooting_targets: public read" ON public.shooting_targets;
CREATE POLICY "shooting_targets: public read"
  ON public.shooting_targets FOR SELECT USING (true);
-- INSERT/UPDATE/DELETE は service_role (Server Action) のみ

-- ⑥ Realtime 公開
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.shooting_targets;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- RPC 関数
-- ═══════════════════════════════════════════════════════════════════════════

-- ⑦ register_shooting_hit: 命中時の原子的処理
CREATE OR REPLACE FUNCTION public.register_shooting_hit(
  p_game_id         uuid,
  p_player_id       uuid,
  p_device_id       text,
  p_target_id       uuid,
  p_combo_bonus     integer,
  p_distance_bonus  real,    -- Outdoor のみ >0、Indoor は 0
  p_min_range_m     real     -- 距離ボーナス計算用の基準
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_target  record;
  v_player  record;
  v_score   integer := 0;
  v_killed  boolean := false;
  v_combo   integer := 0;
  v_now     timestamptz := now();
BEGIN
  -- プレイヤー認証 + ロック取得
  SELECT id, device_id, shooting_ammo, shooting_combo, shooting_max_combo, shooting_score,
         shooting_reload_until
    INTO v_player
    FROM public.players
   WHERE id = p_player_id
   FOR UPDATE;
  IF v_player IS NULL OR v_player.device_id <> p_device_id THEN
    RETURN jsonb_build_object('error', 'AUTH_FAILED');
  END IF;
  IF v_player.shooting_ammo <= 0 THEN
    RETURN jsonb_build_object('error', 'OUT_OF_AMMO');
  END IF;
  IF v_player.shooting_reload_until IS NOT NULL AND v_player.shooting_reload_until > v_now THEN
    RETURN jsonb_build_object('error', 'RELOADING');
  END IF;

  -- ターゲット取得 + ロック
  SELECT * INTO v_target FROM public.shooting_targets
    WHERE id = p_target_id AND game_id = p_game_id AND owner_player_id = p_player_id
    FOR UPDATE;
  IF v_target IS NULL THEN
    RETURN jsonb_build_object('error', 'TARGET_NOT_FOUND');
  END IF;
  IF v_target.killed_at IS NOT NULL OR v_target.expires_at <= v_now THEN
    -- 期限切れ・撃破済み → 弾だけ消費
    UPDATE public.players SET shooting_ammo = shooting_ammo - 1 WHERE id = p_player_id;
    RETURN jsonb_build_object('error', 'EXPIRED', 'ammo', v_player.shooting_ammo - 1);
  END IF;

  -- HP デクリメント
  IF v_target.hp - 1 <= 0 THEN
    v_killed := true;
    v_combo  := v_player.shooting_combo + 1;
    v_score  := v_target.base_score + v_combo * p_combo_bonus;
    IF p_distance_bonus > 0 AND v_target.dist_m > p_min_range_m THEN
      v_score := v_score + CEIL((v_target.dist_m - p_min_range_m) * p_distance_bonus)::int;
    END IF;

    UPDATE public.shooting_targets
       SET hp = 0, killed_at = v_now, killed_by = p_player_id
     WHERE id = p_target_id;

    UPDATE public.players
       SET shooting_score     = shooting_score + v_score,
           shooting_combo     = v_combo,
           shooting_max_combo = GREATEST(shooting_max_combo, v_combo),
           shooting_ammo      = shooting_ammo - 1
     WHERE id = p_player_id;
  ELSE
    -- 耐久型 (tough) で未撃破: 弾消費のみ、コンボは継続
    UPDATE public.shooting_targets SET hp = hp - 1 WHERE id = p_target_id;
    UPDATE public.players SET shooting_ammo = shooting_ammo - 1 WHERE id = p_player_id;
    v_combo := v_player.shooting_combo;  -- 維持
  END IF;

  RETURN jsonb_build_object(
    'killed', v_killed,
    'score',  v_score,
    'combo',  v_combo,
    'ammo',   v_player.shooting_ammo - 1,
    'kind',   v_target.kind::text
  );
END $$;

-- ⑧ register_shooting_miss: 空撃ち時の弾消費 + コンボリセット
CREATE OR REPLACE FUNCTION public.register_shooting_miss(
  p_player_id    uuid,
  p_device_id    text,
  p_miss_penalty integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_player record;
BEGIN
  SELECT id, device_id, shooting_ammo, shooting_score, shooting_reload_until
    INTO v_player FROM public.players
   WHERE id = p_player_id FOR UPDATE;
  IF v_player IS NULL OR v_player.device_id <> p_device_id THEN
    RETURN jsonb_build_object('error', 'AUTH_FAILED');
  END IF;
  IF v_player.shooting_ammo <= 0 THEN
    RETURN jsonb_build_object('error', 'OUT_OF_AMMO');
  END IF;
  IF v_player.shooting_reload_until IS NOT NULL AND v_player.shooting_reload_until > now() THEN
    RETURN jsonb_build_object('error', 'RELOADING');
  END IF;

  UPDATE public.players
     SET shooting_ammo   = shooting_ammo - 1,
         shooting_combo  = 0,
         shooting_misses = shooting_misses + 1,
         shooting_score  = GREATEST(0, shooting_score + p_miss_penalty)
   WHERE id = p_player_id;

  RETURN jsonb_build_object('ammo', v_player.shooting_ammo - 1);
END $$;

-- ⑨ expire_shooting_target: 期限切れでコンボリセット
CREATE OR REPLACE FUNCTION public.expire_shooting_target(
  p_player_id      uuid,
  p_device_id      text,
  p_target_id      uuid,
  p_combo_penalty  integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_player record;
BEGIN
  SELECT id, device_id FROM public.players INTO v_player
   WHERE id = p_player_id;
  IF v_player IS NULL OR v_player.device_id <> p_device_id THEN
    RETURN jsonb_build_object('error', 'AUTH_FAILED');
  END IF;

  -- ターゲット行を「期限切れマーク」（killed_at = expires_at に揃え、killed_by は NULL のまま）
  UPDATE public.shooting_targets
     SET killed_at = COALESCE(killed_at, now())
   WHERE id = p_target_id
     AND owner_player_id = p_player_id
     AND killed_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('skipped', true);
  END IF;

  UPDATE public.players
     SET shooting_combo  = 0,
         shooting_score  = GREATEST(0, shooting_score + p_combo_penalty),
         shooting_misses = shooting_misses + 1
   WHERE id = p_player_id;

  RETURN jsonb_build_object('ok', true);
END $$;

-- ⑩ trigger_reload / finish_reload
CREATE OR REPLACE FUNCTION public.trigger_shooting_reload(
  p_player_id  uuid,
  p_device_id  text,
  p_reload_ms  integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_player       record;
  v_reload_until timestamptz;
BEGIN
  SELECT id, device_id, shooting_reload_until INTO v_player
    FROM public.players WHERE id = p_player_id FOR UPDATE;
  IF v_player IS NULL OR v_player.device_id <> p_device_id THEN
    RETURN jsonb_build_object('error', 'AUTH_FAILED');
  END IF;
  -- 既にリロード中なら無視
  IF v_player.shooting_reload_until IS NOT NULL AND v_player.shooting_reload_until > now() THEN
    RETURN jsonb_build_object('skipped', true,
      'reload_until', v_player.shooting_reload_until);
  END IF;
  v_reload_until := now() + (p_reload_ms * interval '1 millisecond');
  UPDATE public.players
     SET shooting_reload_until = v_reload_until
   WHERE id = p_player_id;
  RETURN jsonb_build_object('reload_until', v_reload_until);
END $$;

CREATE OR REPLACE FUNCTION public.finish_shooting_reload(
  p_player_id  uuid,
  p_device_id  text,
  p_mag_size   integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_player record;
BEGIN
  SELECT id, device_id, shooting_reload_until INTO v_player
    FROM public.players WHERE id = p_player_id FOR UPDATE;
  IF v_player IS NULL OR v_player.device_id <> p_device_id THEN
    RETURN jsonb_build_object('error', 'AUTH_FAILED');
  END IF;
  UPDATE public.players
     SET shooting_ammo         = p_mag_size,
         shooting_reload_until = NULL
   WHERE id = p_player_id;
  RETURN jsonb_build_object('ammo', p_mag_size);
END $$;

-- ⑪ init_shooting_mode: プレイヤーの base 位置と初期弾倉をまとめて設定
CREATE OR REPLACE FUNCTION public.init_shooting_mode(
  p_game_id   uuid,
  p_mag_size  integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- プレイヤーの現在 lat/lng を base に固定
  UPDATE public.players
     SET base_lat              = COALESCE(base_lat, lat),
         base_lng              = COALESCE(base_lng, lng),
         shooting_score        = 0,
         shooting_combo        = 0,
         shooting_max_combo    = 0,
         shooting_misses       = 0,
         shooting_ammo         = p_mag_size,
         shooting_reload_until = NULL
   WHERE game_id = p_game_id
     AND is_bot  = false;
END $$;

-- ⑫ spawn_shooting_target: kind に応じたパラメータをサーバー側で確定して INSERT
--    （クライアントは bearing/dist/kind のみ提案、ステータスは改ざん不可）
CREATE OR REPLACE FUNCTION public.spawn_shooting_target(
  p_game_id    uuid,
  p_player_id  uuid,
  p_device_id  text,
  p_kind       text,
  p_bearing    real,
  p_dist_m     real,
  p_lifetime_ms integer,
  p_travel_ms  integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_player record;
  v_kind   shooting_target_kind := p_kind::shooting_target_kind;
  v_hp     integer := 1;
  v_size   real    := 1.0;
  v_score  integer := 100;
  v_drift  real    := 0;
  v_lifetime_mul real := 1.0;
  v_active integer;
  v_max    integer;
  v_id     uuid;
BEGIN
  SELECT id, device_id INTO v_player FROM public.players
   WHERE id = p_player_id;
  IF v_player IS NULL OR v_player.device_id <> p_device_id THEN
    RETURN jsonb_build_object('error', 'AUTH_FAILED');
  END IF;

  -- max_active を超えていれば拒否
  SELECT shooting_max_active INTO v_max FROM public.games WHERE id = p_game_id;
  SELECT COUNT(*) INTO v_active FROM public.shooting_targets
   WHERE game_id = p_game_id AND owner_player_id = p_player_id AND killed_at IS NULL;
  IF v_active >= COALESCE(v_max, 3) THEN
    RETURN jsonb_build_object('error', 'MAX_ACTIVE');
  END IF;

  -- kind 別パラメータ（lib/game/constants.ts の SHOOTING_TARGET_KINDS と同期）
  CASE v_kind
    WHEN 'standard' THEN v_hp:=1; v_size:=1.0;  v_score:=100;  v_drift:=0;  v_lifetime_mul:=1.0;
    WHEN 'tough'    THEN v_hp:=3; v_size:=1.2;  v_score:=300;  v_drift:=0;  v_lifetime_mul:=1.5;
    WHEN 'tiny'     THEN v_hp:=1; v_size:=0.45; v_score:=400;  v_drift:=0;  v_lifetime_mul:=0.9;
    WHEN 'runner'   THEN v_hp:=1; v_size:=0.9;  v_score:=250;  v_drift:=35; v_lifetime_mul:=1.2;
    WHEN 'bonus'    THEN v_hp:=1; v_size:=0.6;  v_score:=1000; v_drift:=60; v_lifetime_mul:=0.7;
  END CASE;

  -- runner / bonus は方向ランダム
  IF v_drift > 0 AND random() < 0.5 THEN v_drift := -v_drift; END IF;

  INSERT INTO public.shooting_targets (
    game_id, owner_player_id, kind, bearing_deg, dist_m,
    drift_dps, size_factor, hp, max_hp, base_score,
    spawn_at, expires_at, travel_ms
  ) VALUES (
    p_game_id, p_player_id, v_kind, p_bearing, p_dist_m,
    v_drift, v_size, v_hp, v_hp, v_score,
    now(), now() + (p_lifetime_ms * v_lifetime_mul * interval '1 millisecond'),
    p_travel_ms
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'kind', v_kind, 'hp', v_hp,
    'base_score', v_score, 'drift_dps', v_drift, 'size_factor', v_size);
END $$;

-- ⑬ commit_shooting_score: 集計トリガー（finishGame 時の最終 winner_id 確定）
CREATE OR REPLACE FUNCTION public.commit_shooting_score(p_game_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_winner uuid;
BEGIN
  SELECT id INTO v_winner FROM public.players
   WHERE game_id = p_game_id AND is_bot = false
   ORDER BY shooting_score DESC NULLS LAST, shooting_max_combo DESC NULLS LAST
   LIMIT 1;

  UPDATE public.games
     SET winner_id = v_winner
   WHERE id = p_game_id
     AND status = 'finished';
END $$;
