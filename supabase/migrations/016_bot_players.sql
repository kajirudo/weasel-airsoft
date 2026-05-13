-- migration 016: ソロプレイ用ボットプレイヤーシステム
-- players テーブルにボット用カラムを追加し、QrCodeId の制約を拡張する

-- ── カラム追加 ─────────────────────────────────────────────────────────────────
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS is_bot       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bot_behavior text;

-- bot_behavior の CHECK 制約
ALTER TABLE public.players DROP CONSTRAINT IF EXISTS players_bot_behavior_check;
ALTER TABLE public.players ADD CONSTRAINT players_bot_behavior_check
  CHECK (bot_behavior IS NULL OR bot_behavior IN (
    'roamer', 'defender', 'rusher', 'crew_bot', 'spy_bot'
  ));

-- ── qr_code_id 制約を拡張（bot_1〜bot_8 を追加） ─────────────────────────────
-- 既存の CHECK 制約を削除して再作成
ALTER TABLE public.players DROP CONSTRAINT IF EXISTS players_qr_code_id_check;
ALTER TABLE public.players ADD CONSTRAINT players_qr_code_id_check
  CHECK (qr_code_id IN (
    'player_1','player_2','player_3','player_4','player_5','player_6',
    'bot_1','bot_2','bot_3','bot_4','bot_5','bot_6','bot_7','bot_8'
  ));

-- ── UNIQUE 制約: ボットは複数の同じ qr_code_id を許可 ─────────────────────────
-- 既存の UNIQUE 制約（全行対象）を削除
ALTER TABLE public.players DROP CONSTRAINT IF EXISTS players_game_id_qr_code_id_key;

-- 人間プレイヤーのみ qr_code_id の一意性を保証（部分インデックス）
CREATE UNIQUE INDEX IF NOT EXISTS players_game_id_qr_code_id_human_idx
  ON public.players (game_id, qr_code_id)
  WHERE is_bot = false;

-- ── RLS: ボットは service_role 経由のみ挿入（botActions.ts の Server Action） ─
-- 既存の "players: insert own" ポリシーはそのまま（人間プレイヤー用）
-- ボットはサービスロールクライアントで INSERT するので追加ポリシー不要
