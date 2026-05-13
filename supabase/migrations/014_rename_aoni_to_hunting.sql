-- ── 014: ゲームモード 'aoni' → 'hunting' リネーム ─────────────────────────────

-- ① 既存データを移行（active/finished なゲームの game_mode を更新）
UPDATE public.games
SET game_mode = 'hunting'
WHERE game_mode = 'aoni';

-- ② winner_team の 'player' / 'npc' は継続使用のため変更なし

-- ③ CHECK 制約を更新
ALTER TABLE public.games
  DROP CONSTRAINT IF EXISTS games_game_mode_check;

ALTER TABLE public.games
  ADD CONSTRAINT games_game_mode_check
  CHECK (game_mode IN ('deathmatch','battle','survival','tactics','traitor','hunting'));
