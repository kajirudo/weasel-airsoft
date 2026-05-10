-- Migration 002: プレイヤー接続状態追跡（ハートビート機構）
-- Run AFTER 001_game_balance.sql

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_players_last_seen
  ON public.players (game_id, is_alive, last_seen)
  WHERE is_alive = true;

COMMENT ON COLUMN public.players.last_seen IS '最後にハートビートを受信した時刻';
