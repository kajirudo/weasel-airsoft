-- Migration 006: チームモード + キルフィード用カラム

-- ゲームにチームモードと勝利チームを追加
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS team_mode    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS winner_team  TEXT    CHECK (winner_team IN ('red', 'blue'));

-- プレイヤーにチームと撃破者名を追加
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS team         TEXT NOT NULL DEFAULT 'none'
    CHECK (team IN ('none', 'red', 'blue')),
  ADD COLUMN IF NOT EXISTS killer_name  TEXT;
