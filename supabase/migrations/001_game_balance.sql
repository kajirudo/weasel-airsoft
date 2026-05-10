-- Migration 001: ゲームバランス設定カラムの追加
-- Run in Supabase SQL editor AFTER schema.sql

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS hit_damage     INT NOT NULL DEFAULT 25
    CHECK (hit_damage     BETWEEN 5  AND 100),
  ADD COLUMN IF NOT EXISTS shoot_cooldown INT NOT NULL DEFAULT 800
    CHECK (shoot_cooldown BETWEEN 200 AND 5000);

COMMENT ON COLUMN public.games.hit_damage     IS '1ヒットのダメージ量 (5〜100)';
COMMENT ON COLUMN public.games.shoot_cooldown IS '射撃クールダウン ms (200〜5000)';
