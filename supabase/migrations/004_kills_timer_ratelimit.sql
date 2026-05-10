-- Migration 004: キル数カウンター + ゲームタイマー + サーバーサイドレート制限
-- supabase/migrations/003_six_players_short_code.sql の後に実行してください

-- 1. キル数カウンター
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS kills INT NOT NULL DEFAULT 0;

-- 2. ゲームタイマー（0 = 無制限）
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS duration_minutes INT NOT NULL DEFAULT 0
    CHECK (duration_minutes >= 0 AND duration_minutes <= 60);

-- 3. サーバーサイドショットレート制限用タイムスタンプ
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS last_shot_at TIMESTAMPTZ;
