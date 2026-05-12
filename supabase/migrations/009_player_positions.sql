-- ミニマップ用 GPS 位置情報
-- players 行は既に game_id ごとに Realtime 購読されているため、
-- 別テーブルを作らずこのカラムを更新するだけで全員に配信される。

alter table public.players
  add column if not exists lat     double precision,
  add column if not exists lng     double precision,
  add column if not exists heading real;  -- 北からの時計回り角度（度）
