'use client'

import { useState, useEffect, useRef } from 'react'
import type { GameStatus } from '@/types/database'

interface UseGameTimerParams {
  startedAt:       string | null
  durationMinutes: number
  status:          GameStatus | undefined
  /** タイマーが 0 になったときに1回だけ呼ばれる */
  onExpire:        () => void
}

interface UseGameTimerResult {
  /** 残り秒数。無制限（durationMinutes=0）やゲーム非アクティブ時は null */
  remainingSeconds: number | null
}

export function useGameTimer({
  startedAt,
  durationMinutes,
  status,
  onExpire,
}: UseGameTimerParams): UseGameTimerResult {
  const [remainingSeconds, setRemaining] = useState<number | null>(null)
  // onExpire を ref に持ち、最新クロージャを常に参照する
  const onExpireRef = useRef(onExpire)
  useEffect(() => { onExpireRef.current = onExpire })
  // 複数回呼ばれないようにフラグ管理
  const firedRef = useRef(false)

  useEffect(() => {
    // タイマー無効条件
    if (!startedAt || durationMinutes <= 0 || status !== 'active') {
      setRemaining(null)
      return
    }

    firedRef.current = false
    const totalMs = durationMinutes * 60 * 1000

    function tick() {
      const elapsed = Date.now() - new Date(startedAt!).getTime()
      const rem = Math.max(0, totalMs - elapsed)
      setRemaining(Math.ceil(rem / 1000))

      if (rem <= 0 && !firedRef.current) {
        firedRef.current = true
        onExpireRef.current()
      }
    }

    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [startedAt, durationMinutes, status])

  return { remainingSeconds }
}
