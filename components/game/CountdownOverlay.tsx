'use client'

import type { CountdownPhase } from '@/hooks/useCountdown'

interface CountdownOverlayProps {
  phase: CountdownPhase
  count: number | null
}

/**
 * ゲーム開始時の 3-2-1-GO! オーバーレイ。
 * phase が 'done' または 'idle' のときは描画しない。
 */
export function CountdownOverlay({ phase, count }: CountdownOverlayProps) {
  if (phase === 'idle' || phase === 'done') return null

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
      {/* 薄い暗幕 */}
      <div className="absolute inset-0 bg-black/40" />

      <div className="relative text-center">
        {phase === 'counting' && count !== null && (
          <p
            key={count}
            className="text-white font-black drop-shadow-lg"
            style={{
              fontSize: '8rem',
              lineHeight: 1,
              animation: 'countdown-pop 0.9s ease-out forwards',
            }}
          >
            {count}
          </p>
        )}

        {phase === 'go' && (
          <p
            className="text-green-400 font-black drop-shadow-lg"
            style={{
              fontSize: '5rem',
              lineHeight: 1,
              letterSpacing: '0.1em',
              animation: 'countdown-pop 0.9s ease-out forwards',
            }}
          >
            GO!
          </p>
        )}
      </div>

      <style>{`
        @keyframes countdown-pop {
          0%   { transform: scale(1.4); opacity: 1; }
          70%  { transform: scale(1);   opacity: 1; }
          100% { transform: scale(0.8); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
