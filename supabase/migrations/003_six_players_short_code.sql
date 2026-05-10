-- Migration 003: 6-player support + short invite code
-- Run this in the Supabase SQL Editor

-- 1. Add short_code column to games (unique 6-char invite code)
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS short_code TEXT UNIQUE;

-- 2. Extend qr_code_id constraint to allow player_6
ALTER TABLE public.players
  DROP CONSTRAINT IF EXISTS players_qr_code_id_check;

ALTER TABLE public.players
  ADD CONSTRAINT players_qr_code_id_check
    CHECK (qr_code_id IN (
      'player_1','player_2','player_3','player_4','player_5','player_6'
    ));

-- 3. Index for fast short_code lookups (used in join flow)
CREATE INDEX IF NOT EXISTS games_short_code_idx ON public.games (short_code);
