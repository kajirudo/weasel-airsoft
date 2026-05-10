'use client'

import { useEffect, useState, useCallback } from 'react'
import type { KillcamData } from '@/hooks/useKillcam'

interface KillcamOverlayProps {
  data:      KillcamData
  onDismiss: () => void
}

const DISPLAY_MS  = 7000
const PROGRESS_HZ = 30

/** Web Share API で画像ファイルのシェアをサポートしているか */
function canShareImage(): boolean {
  if (typeof navigator === 'undefined') return false
  if (!navigator.share || !navigator.canShare) return false
  return navigator.canShare({ files: [new File([], 'test.jpg', { type: 'image/jpeg' })] })
}

export function KillcamOverlay({ data, onDismiss }: KillcamOverlayProps) {
  const [progress,   setProgress]  = useState(100)
  const [sharing,    setSharing]   = useState(false)
  const [shareReady, setShareReady] = useState(false)

  // マウント時に Share API 対応確認
  useEffect(() => { setShareReady(canShareImage()) }, [])

  // 自動非表示タイマー
  useEffect(() => {
    const start    = Date.now()
    const interval = window.setInterval(() => {
      const pct = Math.max(0, 100 - ((Date.now() - start) / DISPLAY_MS) * 100)
      setProgress(pct)
      if (pct === 0) clearInterval(interval)
    }, 1000 / PROGRESS_HZ)

    const timeout = window.setTimeout(onDismiss, DISPLAY_MS)
    return () => { clearInterval(interval); clearTimeout(timeout) }
  }, [onDismiss])

  // Web Share API — 画像を fetch して File に変換してからシェア
  const handleShare = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()   // 親の onDismiss を発火させない
    setSharing(true)
    try {
      const res  = await fetch(data.imageUrl)
      const blob = await res.blob()
      const file = new File([blob], 'killcam.jpg', { type: 'image/jpeg' })
      await navigator.share({
        files: [file],
        title: `${data.shooterName}にやられた！`,
        text:  'WEASEL AIRSOFT — キルカム証拠写真',
      })
    } catch {
      // キャンセルや非対応は無視
    } finally {
      setSharing(false)
    }
  }, [data])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm"
      style={{ animation: 'fadeIn 0.25s ease' }}
      onClick={onDismiss}
    >
      <style>{`@keyframes fadeIn { from { opacity:0 } to { opacity:1 } }`}</style>

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
        className="relative w-full mx-4 max-w-sm rounded-xl overflow-hidden shadow-2xl border border-red-900/60"
        style={{ boxShadow: '0 0 40px rgba(200,0,0,0.35)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={data.imageUrl}
          alt="kill cam"
          className="w-full h-auto block"
          draggable={false}
          onError={(e) => {
            const el = e.currentTarget as HTMLImageElement
            el.style.display = 'none'
            el.parentElement!.style.background = '#111'
          }}
        />
        {/* CRT スキャンライン */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.06) 2px,rgba(0,0,0,0.06) 4px)',
          }}
        />
        <div className="absolute inset-0 border-2 border-red-600/40 rounded-xl pointer-events-none animate-pulse" />
      </div>

      {/* ── ボタン行 ── */}
      <div className="mt-3 w-full max-w-sm mx-4 flex items-center gap-2">
        {/* タイマーバー */}
        <div className="flex-1 h-0.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-red-600 rounded-full"
            style={{ width: `${progress}%`, transition: 'none' }}
          />
        </div>

        {/* Web Share ボタン（対応端末のみ表示） */}
        {shareReady && (
          <button
            onClick={handleShare}
            disabled={sharing}
            className="flex items-center gap-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-50
                       text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors shrink-0"
          >
            {sharing ? (
              <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <span>📤</span>
            )}
            シェア
          </button>
        )}
      </div>

      <p className="mt-2 text-gray-600 text-xs pointer-events-none select-none">
        タップで閉じる
      </p>
    </div>
  )
}
