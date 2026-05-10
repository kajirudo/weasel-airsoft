-- players テーブルに killcam_url を追加
-- 撃たれたときの証拠写真 URL を保存し、リザルト画面で表示する
alter table public.players
  add column if not exists killcam_url text default null;
