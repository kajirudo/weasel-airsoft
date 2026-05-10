-- Weasel-Airsoft: 定期クリーンアップジョブ
-- Supabase の「Database > Extensions」で pg_cron を有効にしてから実行してください。
--
-- このジョブは毎時0分に実行され、以下を削除します：
--   - 24時間以上前に作成され、まだ lobby 状態のゲーム（放置ロビー）
--   - 7日以上前に終了した finished ゲーム（履歴クリーンアップ）
--
-- players テーブルは games テーブルに ON DELETE CASCADE しているため、
-- games 行を削除するだけで関連する players も自動削除されます。

SELECT cron.schedule(
  'weasel-cleanup-stale-games',   -- ジョブ名（一意）
  '0 * * * *',                    -- 毎時0分に実行
  $$
    -- 放置ロビーを削除（24時間以上 lobby のまま）
    DELETE FROM public.games
    WHERE status = 'lobby'
      AND created_at < now() - interval '24 hours';

    -- 古い終了済みゲームを削除（7日以上前）
    DELETE FROM public.games
    WHERE status = 'finished'
      AND finished_at < now() - interval '7 days';
  $$
);

-- ジョブを確認するには:
-- SELECT * FROM cron.job;

-- ジョブを削除するには:
-- SELECT cron.unschedule('weasel-cleanup-stale-games');
