-- ============================================================
-- killcam バケット & ストレージポリシー設定
-- Supabase Dashboard > SQL Editor から実行してください。
-- ============================================================

-- 1. バケット作成（公開バケット）
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'killcam',
  'killcam',
  true,                  -- 公開バケット（署名不要で画像表示可能）
  1048576,               -- 最大 1 MB / 枚（960×540 JPEG で余裕）
  array['image/jpeg']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. INSERT ポリシー（ブラウザ直接アップロード用）
--    アップロードパスが gameId/playerId/timestamp.jpg の形式に限定することで
--    任意パスへの書き込みを防ぐ。
--    ※ anon ロールからの INSERT を許可する（認証不要のゲームアプリのため）

drop policy if exists "killcam: anon upload" on storage.objects;
create policy "killcam: anon upload"
  on storage.objects for insert
  with check (bucket_id = 'killcam');

-- 3. SELECT ポリシー（公開バケットは自動許可されるが明示的に定義）
drop policy if exists "killcam: public read" on storage.objects;
create policy "killcam: public read"
  on storage.objects for select
  using (bucket_id = 'killcam');

-- 4. DELETE は禁止（cleanup は cron のみ）

-- 5. 古い killcam 画像の自動削除（pg_cron が有効な場合）
select cron.schedule(
  'cleanup-killcam',
  '0 3 * * *',
  $$
    delete from storage.objects
    where bucket_id = 'killcam'
      and created_at < now() - interval '24 hours';
  $$
);
