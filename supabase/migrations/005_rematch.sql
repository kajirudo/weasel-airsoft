-- Migration 005: リマッチ連携カラム
-- 終了したゲームから次のゲームへのリンクを保持する

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS next_game_id UUID REFERENCES public.games(id) ON DELETE SET NULL;
