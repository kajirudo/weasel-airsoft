'use client'

import { useEffect, useState } from 'react'
import type { KillcamData } from '@/hooks/useKillcam'

interface KillcamOverlayProps {
  data:      KillcamData
  onDismiss: () => void
}

const DISPLAY_MS   = 7000
const PROGRESS_HZ  = 30  // progress bar 更新頻度

export function KillcamOverlay({ data, onDismiss }: KillcamOverlayProps) {
  const [progress, setProgress] = useState(100)  // 100→0 で縮小するタイマーバー

  // 自動非表示
  useEffect(() => {
    const start    = Date.now()
    const interval = window.setInterval(() => {
      const elapsed = Date.now() - start
      const pct     = Math.max(0, 100 - (elapsed / DISPLAY_MS) * 100)
      setProgress(pct)
      if (pct === 0) clearInterval(interval)
    }, 1000 / PROGRESS_HZ)

    const timeout = window.setTimeout(onDismiss, DISPLAY_MS)
    return () => { clearInterval(interval); clearTimeout(timeout) }
  }, [onDismiss])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm animate-in fade-in duration-300"
      onClick={onDismiss}
    >
      {/* ── タイトル ── */}
      <div className="mb-3 text-center pointer-events-none select-none">
        <p className="text-red-500 font-black text-4xl tracking-[0.25em]">KILL CAM</p>
        <p className="text-gray-300 text-sm mt-1">
          <span className="text-yellow-400 font-bold">{data.shooterName}</span>
          {' '}に撃たれました
        </p>
      </div>

      {/* ── 証拠写真 ── */}
      <div
        className="relative w-full mx-4 max-w-sm rounded-xl overflow-hidden
                   shadow-2xl border border-red-900/60"
        style={{ boxShadow: '0 0 40px rgba(200,0,0,0.35)' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={data.imageUrl}
          alt="kill cam"
          className="w-full h-auto block"
          draggable={false}
          onError={(e) => {
            // 画像読み込み失敗時はプレースホルダー表示
            const el = e.currentTarget as HTMLImageElement
            el.style.display = 'none'
            el.parentElement!.style.background = '#111'
          }}
        />

        {/* CRT スキャンライン演出 */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.06) 2px,rgba(0,0,0,0.06) 4px)',
          }}
        />

        {/* 赤枠のグロー点滅 */}
        <div className="absolute inset-0 border-2 border-red-600/40 rounded-xl pointer-events-none animate-pulse" />
      </div>

      {/* ── タイマーバー ── */}
      <div className="mt-4 w-full max-w-sm mx-4 h-0.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-red-600 rounded-full transition-none"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* フッター */}
      <p className="mt-2 text-gray-600 text-xs pointer-events-none select-none">
        タップで閉じる
      </p>
    </div>
  )
}
