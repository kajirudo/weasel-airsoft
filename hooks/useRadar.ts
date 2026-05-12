'use client'

/**
 * useRadar — GPS 位置追跡フック
 *
 * - navigator.geolocation.watchPosition でリアルタイム GPS を取得
 * - DeviceOrientationEvent でコンパス方位（heading）を取得
 * - 3 秒デバウンスで Supabase に位置情報を送信
 *   （Realtime を通じて他プレイヤーのミニマップに反映される）
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { updatePosition } from '@/lib/game/actions'
import type { LocalPlayerSession } from '@/types/game'

export interface GeoPosition {
  lat:      number
  lng:      number
  heading:  number   // 北からの時計回り（度）
  accuracy: number   // 精度（m）
}

interface UseRadarParams {
  session: LocalPlayerSession | null
  enabled: boolean
}

export function useRadar({ session, enabled }: UseRadarParams) {
  const [geoPos,       setGeoPos]       = useState<GeoPosition | null>(null)
  const [gpsAvailable, setGpsAvailable] = useState<boolean | null>(null)  // null=未確認

  const watchIdRef   = useRef<number | null>(null)
  const headingRef   = useRef(0)
  const sendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef   = useRef<{ lat: number; lng: number; heading: number } | null>(null)

  const flush = useCallback(async () => {
    if (!session || !pendingRef.current) return
    const snap = pendingRef.current
    pendingRef.current = null
    try {
      await updatePosition({
        playerId: session.playerId,
        deviceId: session.deviceId,
        lat:      snap.lat,
        lng:      snap.lng,
        heading:  snap.heading,
      })
    } catch { /* ネットワークエラーは無視 */ }
  }, [session])

  useEffect(() => {
    if (!enabled || !session) return
    if (typeof navigator === 'undefined') return
    if (!('geolocation' in navigator)) { setGpsAvailable(false); return }

    // ── コンパス（DeviceOrientationEvent）──────────────────────────────────
    function onOrientation(e: DeviceOrientationEvent) {
      const alpha = e.alpha ?? 0
      headingRef.current = alpha
      setGeoPos(prev => prev ? { ...prev, heading: alpha } : null)
    }
    window.addEventListener('deviceorientation', onOrientation, true)

    // ── GPS watchPosition ───────────────────────────────────────────────────
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsAvailable(true)
        const next: GeoPosition = {
          lat:      pos.coords.latitude,
          lng:      pos.coords.longitude,
          heading:  headingRef.current,
          accuracy: pos.coords.accuracy,
        }
        setGeoPos(next)

        // 送信バッファに積んで 3 秒後に flush（連続更新を間引く）
        pendingRef.current = { lat: next.lat, lng: next.lng, heading: next.heading }
        if (sendTimerRef.current) clearTimeout(sendTimerRef.current)
        sendTimerRef.current = setTimeout(flush, 3000)
      },
      (err) => {
        // PERMISSION_DENIED(1) or POSITION_UNAVAILABLE(2) or TIMEOUT(3)
        if (err.code === 1 || err.code === 2) setGpsAvailable(false)
        // TIMEOUT は一時的なので無視して再試行を待つ
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 },
    )

    return () => {
      window.removeEventListener('deviceorientation', onOrientation, true)
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      if (sendTimerRef.current) clearTimeout(sendTimerRef.current)
    }
  }, [enabled, session, flush])

  return { geoPos, gpsAvailable }
}
