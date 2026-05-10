-- ============================================================
-- killcam バケット & ストレージポリシー設定
-- Supabase Dashboard > Storage で実行するか、
-- psql / SQL Editor から実行してください。
-- ============================================================

-- 1. バケット作成（公開バケット）
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'killcam',
  'killcam',
  true,                  -- 公開バケット（署名不要で画像表示可能）
  524288,                -- 最大 512 KB / 枚
  array['image/jpeg']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. ポリシー: サービスロール（Server Action）からの INSERT を許可
--    anon ロールからのアップロードは行わないため、追加ポリシー不要。
--    Storage の RLS は bucket が public の場合、SELECT は自動で許可される。
--    INSERT は service_role キーを使う Server Action 経由のみ行う。

-- ※ Supabase Dashboard の Storage > Policies で確認できます。
-- 万一 RLS エラーが出る場合は以下を実行してください:

-- create policy "killcam: service role insert"
--   on storage.objects for insert
--   with check (
--     bucket_id = 'killcam'
--     AND (auth.role() = 'service_role')
--   );

-- 3. 古い killcam 画像の自動削除（オプション）
--    pg_cron 拡張が有効な場合のみ使用可。
--    24時間以上経過したファイルをゲーム終了後にクリーンアップする例:
--
-- select cron.schedule(
--   'cleanup-killcam',
--   '0 3 * * *',  -- 毎日 03:00 UTC
--   $$
--     delete from storage.objects
--     where bucket_id = 'killcam'
--       and created_at < now() - interval '24 hours';
--   $$
-- );
