'use client'

import { useEffect, useRef } from 'react'

export function useWakeLock() {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    if (!('wakeLock' in navigator)) return

    async function acquire() {
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen')
      } catch {
        // デバイスが省電力モードの場合は無視
      }
    }

    acquire()

    // バックグラウンドから復帰したときに再取得
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        acquire()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      wakeLockRef.current?.release()
    }
  }, [])
}
