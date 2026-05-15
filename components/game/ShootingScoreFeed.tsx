'use client'

/**
 * ShootingScoreFeed — 命中時にスコアテキストがフライアウトする演出
 *
 * 親から `pushScore(amount, kind)` を呼び出してエントリーを追加する。
 * 各エントリーは 1.4 秒後に自動消滅。
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import type { ShootingTargetKind } from '@/types/database'
import { SHOOTING_TARGET_KINDS }   from '@/lib/game/constants'

interface FloatItem {
  id:     number
  amount: number
  kind:   ShootingTargetKind
  combo:  number
}

const LIFE_MS = 1400

export interface ShootingScoreFeedHandle {
  push: (amount: number, kind: ShootingTargetKind, combo: number) => void
}

interface Props {
  /** 親が ref で受け取って push を呼ぶ */
  feedRef: React.MutableRefObject<ShootingScoreFeedHandle | null>
}

export function ShootingScoreFeed({ feedRef }: Props) {
  const [items, setItems] = useState<FloatItem[]>([])
  const idRef = useRef(0)

  const push = useCallback((amount: number, kind: ShootingTargetKind, combo: number) => {
    const id = ++idRef.current
    setItems(prev => [...prev, { id, amount, kind, combo }])
    setTimeout(() => {
      setItems(prev => prev.filter(it => it.id !== id))
    }, LIFE_MS)
  }, [])

  useEffect(() => {
    feedRef.current = { push }
    return () => { feedRef.current = null }
  }, [feedRef, push])

  return (
    <div className="absolute inset-x-0 top-32 z-[64] flex flex-col items-center gap-0 pointer-events-none">
      {items.map(it => {
        const cfg = SHOOTING_TARGET_KINDS[it.kind]
        return (
          <div
            key={it.id}
            className="font-black drop-shadow-[0_2px_6px_rgba(0,0,0,1)]"
            style={{
              color:     cfg.color,
              fontSize:  it.kind === 'bonus' ? '32px' : '22px',
              animation: 'score-fly 1.4s ease-out forwards',
            }}
          >
            +{it.amount.toLocaleString()}
            {it.combo >= 3 && (
              <span className="ml-2 text-red-400 text-base">×{it.combo}!</span>
            )}
          </div>
        )
      })}

      <style>{`
        @keyframes score-fly {
          0%   { transform: translateY(20px) scale(0.7); opacity: 0; }
          15%  { transform: translateY(0)    scale(1.1); opacity: 1; }
          70%  { transform: translateY(-30px) scale(1);  opacity: 1; }
          100% { transform: translateY(-60px) scale(0.9); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
