'use client'

/**
 * useNPCVibration — NPC との距離・状態に応じてスマホを振動させる。
 */

import { useEffect, useRef } from 'react'

interface Props {
  distM:           number | null
  isBeingLockedOn: boolean
  lockonProgress:  number   // 0〜1
  isLungeArming:   boolean
  isAlive:         boolean
  enabled:         boolean
}

export function useNPCVibration({
  distM, isBeingLockedOn, lockonProgress, isLungeArming, isAlive, enabled,
}: Props) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    if (!enabled || !isAlive || typeof navigator === 'undefined' || !navigator.vibrate) return

    // ランジ予告: 強烈な三連続バースト
    if (isLungeArming) {
      intervalRef.current = setInterval(() => {
        navigator.vibrate([600, 100, 600, 100, 600])
      }, 1000)
      return
    }

    // ロックオン中: progress に応じて間隔を短縮
    if (isBeingLockedOn) {
      const ms = Math.max(250, 1200 - lockonProgress * 950)
      intervalRef.current = setInterval(() => {
        navigator.vibrate([80, 40, 80, 40, 80])
      }, ms)
      return
    }

    // 近接アラート（ロックオン外）
    if (distM == null) return
    let pattern: number[] | null = null
    let ms = 2000
    if      (distM < 5)  { pattern = [60, 60];      ms = 600  }
    else if (distM < 15) { pattern = [40, 80];      ms = 1200 }
    else if (distM < 30) { pattern = [30, 200];     ms = 2000 }

    if (!pattern) return
    intervalRef.current = setInterval(() => {
      navigator.vibrate(pattern!)
    }, ms)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      navigator.vibrate(0)
    }
  }, [distM, isBeingLockedOn, lockonProgress, isLungeArming, isAlive, enabled])

  // アンマウント時クリア
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(0)
    }
  }, [])
}
