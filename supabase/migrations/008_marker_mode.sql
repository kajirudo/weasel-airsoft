-- 008_marker_mode.sql
-- マーカーモード（QR / ArUco）をゲームレベルで管理する
-- ゲーム参加者全員が同じモードを使うことを保証する

alter table public.games
  add column if not exists marker_mode text not null default 'qr'
  check (marker_mode in ('qr', 'aruco'));

comment on column public.games.marker_mode is
  'スキャンするマーカーの種類。qr=QRコード（〜5m）, aruco=ArUco（〜12m）';
