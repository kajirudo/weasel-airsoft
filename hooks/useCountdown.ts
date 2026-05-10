'use client'

import { useState, useEffect, useRef } from 'react'
import type { GameStatus } from '@/types/database'

export type CountdownPhase = 'idle' | 'counting' | 'go' | 'done'

interface UseCountdownResult {
  phase:   CountdownPhase
  count:   number | null   // 3, 2, 1 のいずれか（counting 中のみ）
  isBlock: boolean         // true の間は射撃をブロックすべき
}

/**
 * lobby → active のステータス遷移を検知し、3-2-1-GO! カウントダウンを管理する。
 * ページロード時点ですでに active の場合はカウントダウンしない。
 */
export function useCountdown(status: GameStatus | undefined): UseCountdownResult {
  const [phase, setPhase] = useState<CountdownPhase>('idle')
  const [count, setCount] = useState<number | null>(null)
  const prevRef           = useRef<GameStatus | undefined>(undefined)
  const initializedRef    = useRef(false)

  useEffect(() => {
    // 初回マウント時のステータスを記録（すでに active なら無視）
    if (!initializedRef.current) {
      initializedRef.current = true
      prevRef.current = status
      return
    }

    const prev = prevRef.current
    prevRef.current = status

    // lobby → active の遷移のみカウントダウン開始
    if (prev !== 'lobby' || status !== 'active') return

    setPhase('counting')
    setCount(3)

    const t1 = setTimeout(() => setCount(2),        1000)
    const t2 = setTimeout(() => setCount(1),        2000)
    const t3 = setTimeout(() => { setPhase('go'); setCount(null) }, 3000)
    const t4 = setTimeout(() => setPhase('done'),   4000)

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4) }
  }, [status])

  return {
    phase,
    count,
    isBlock: phase === 'counting' || phase === 'go',
  }
}
