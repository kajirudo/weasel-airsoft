'use client'

/**
 * StormOverlay — ストーム圏外警告 UI
 *
 * - 圏外のとき画面四辺に赤いパルス枠を表示
 * - 縮小中は薄い黄色のバー（残り安全圏）を表示
 */

import { memo } from 'react'
import type { StormState } from '@/hooks/useStorm'

interface Props {
  storm:   StormState
  visible: boolean   // game_mode === 'battle' && game.status === 'active'
}

export const StormOverlay = memo(function StormOverlay({ storm, visible }: Props) {
  if (!visible) return null

  return (
    <>
      {/* 圏外警告: 赤パルス枠 */}
      {storm.isOutsideStorm && (
        <div
          className="pointer-events-none fixed inset-0 z-40"
          style={{
            boxShadow: 'inset 0 0 80px 20px rgba(239,68,68,0.7)',
            animation: 'storm-pulse 0.8s ease-in-out infinite alternate',
          }}
        />
      )}

      {/* ストーム縮小中インジケーター（上部バー） */}
      {storm.isShrinking && (
        <div className="pointer-events-none fixed top-0 left-0 right-0 z-40 flex items-center justify-center py-1">
          <span
            className="rounded-full px-3 py-0.5 text-xs font-bold"
            style={{
              background: 'rgba(234,179,8,0.85)',
              color: '#1a1a1a',
            }}
          >
            ⚡ ストーム縮小中
          </span>
        </div>
      )}

      <style>{`
        @keyframes storm-pulse {
          from { opacity: 0.5; }
          to   { opacity: 1;   }
        }
      `}</style>
    </>
  )
})
