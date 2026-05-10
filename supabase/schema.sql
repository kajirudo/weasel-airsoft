-- Weasel-Airsoft: AR Laser Tag Database Schema
-- Run this in the Supabase SQL editor

create extension if not exists "uuid-ossp";

-- ─── GAMES ────────────────────────────────────────────────────────────────────
create table public.games (
  id          uuid primary key default uuid_generate_v4(),
  status      text not null default 'lobby'
                check (status in ('lobby', 'active', 'finished')),
  created_at  timestamptz not null default now(),
  started_at  timestamptz,
  finished_at timestamptz,
  winner_id   uuid
);

-- ─── PLAYERS ──────────────────────────────────────────────────────────────────
create table public.players (
  id          uuid primary key default uuid_generate_v4(),
  game_id     uuid not null references public.games(id) on delete cascade,
  name        text not null,
  hp          integer not null default 100 check (hp >= 0 and hp <= 100),
  qr_code_id  text not null
                check (qr_code_id in ('player_1','player_2','player_3','player_4','player_5')),
  device_id   text not null,
  is_alive    boolean not null default true,
  joined_at   timestamptz not null default now(),
  unique (game_id, qr_code_id),
  unique (game_id, device_id)
);

-- REPLICA IDENTITY FULL: Supabase Realtime の UPDATE payload で old.hp を取得するために必須
alter table public.players replica identity full;

-- Add winner_id FK after both tables are created
alter table public.games
  add constraint games_winner_id_fkey
  foreign key (winner_id) references public.players(id);

-- ─── INDEXES ──────────────────────────────────────────────────────────────────
create index on public.players (game_id);
create index on public.players (game_id, qr_code_id);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
alter table public.games   enable row level security;
alter table public.players enable row level security;

-- 全員が読める（Realtimeとロビー表示に必要）
create policy "games: public read"
  on public.games for select
  using (true);

create policy "players: public read"
  on public.players for select
  using (true);

-- 匿名ユーザーはプレイヤー行をINSERT可能（joinGame Server Actionから呼ぶ）
create policy "players: insert own"
  on public.players for insert
  with check (true);

-- HP更新・ゲーム状態更新はすべてservice roleのServer Action経由のみ
-- anon keyからのUPDATE/DELETEポリシーは設定しない
