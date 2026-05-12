'use client'

/**
 * useStorm — バトルモード ストーム半径計算 + 圏外ダメージティック
 *
 * - ゲーム開始時刻・継続時間から現在の安全圏半径をリアルタイム計算
 * - プレイヤーの GPS 位置がストーム圏外の場合、STORM_TICK_MS ごとに
 *   stormDamage Server Action を呼び出す
 * - ストーム中心座標は game.storm_center_lat/lng から取得
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { stormDamage } from '@/lib/game/actions'
import {
  STORM_START_FRACTION,
  STORM_END_FRACTION,
  STORM_TICK_MS,
} from '@/lib/game/constants'
import type { Game } from '@/types/database'
import type { GeoPosition } from '@/hooks/useRadar'
import type { LocalPlayerSession } from '@/types/game'

export interface StormState {
  /** 現在の安全圏半径（m）。null = ストーム未開始 or GPS なし */
  safeRadiusM:    number | null
  /** プレイヤーがストーム圏外にいるか */
  isOutsideStorm: boolean
  /** ストームが縮小中か */
  isShrinking:    boolean
}

interface UseStormParams {
  game:    Game | null
  geoPos:  GeoPosition | null
  session: LocalPlayerSession | null
  enabled: boolean   // game.status === 'active' && game.game_mode === 'battle'
}

function geoDistM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dlat = (a.lat - b.lat) * 111_320
  const dlng = (a.lng - b.lng) * 111_320 * Math.cos(a.lat * Math.PI / 180)
  return Math.sqrt(dlat ** 2 + dlng ** 2)
}

/** 経過時間割合から現在の安全圏半径を線形補間で計算 */
function computeSafeRadius(
  startedAt:    string,
  durationMin:  number,
  stormRadiusM: number,
  stormFinalM:  number,
): { safeRadiusM: number; isShrinking: boolean } {
  const totalMs   = durationMin * 60 * 1000
  const elapsedMs = Date.now() - new Date(startedAt).getTime()
  const t = Math.min(1, Math.max(0, elapsedMs / totalMs))   // 0〜1

  if (t < STORM_START_FRACTION) {
    return { safeRadiusM: stormRadiusM, isShrinking: false }
  }
  if (t >= STORM_END_FRACTION) {
    return { safeRadiusM: stormFinalM, isShrinking: false }
  }
  // 縮小フェーズ
  const progress  = (t - STORM_START_FRACTION) / (STORM_END_FRACTION - STORM_START_FRACTION)
  const radius    = stormRadiusM + (stormFinalM - stormRadiusM) * progress
  return { safeRadiusM: radius, isShrinking: true }
}

export function useStorm({ game, geoPos, session, enabled }: UseStormParams): StormState {
  const [safeRadiusM,    setSafeRadiusM]    = useState<number | null>(null)
  const [isOutsideStorm, setIsOutsideStorm] = useState(false)
  const [isShrinking,    setIsShrinking]    = useState(false)

  const tickRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const rafRef       = useRef<number | null>(null)
  const isOutsideRef = useRef(false)

  // ── 半径を rAF でリアルタイム更新 ─────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !game?.started_at) {
      setSafeRadiusM(null)
      setIsShrinking(false)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      return
    }

    function update() {
      const { safeRadiusM: r, isShrinking: s } = computeSafeRadius(
        game!.started_at!,
        game!.duration_minutes,
        game!.storm_radius_m,
        game!.storm_final_m,
      )
      setSafeRadiusM(r)
      setIsShrinking(s)
      rafRef.current = requestAnimationFrame(update)
    }
    rafRef.current = requestAnimationFrame(update)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [enabled, game?.started_at, game?.duration_minutes, game?.storm_radius_m, game?.storm_final_m])

  // ── 圏外判定 ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!safeRadiusM || !geoPos || !game?.storm_center_lat || !game?.storm_center_lng) {
      setIsOutsideStorm(false)
      isOutsideRef.current = false
      return
    }
    const distToCenter = geoDistM(geoPos, {
      lat: game.storm_center_lat,
      lng: game.storm_center_lng,
    })
    const outside = distToCenter > safeRadiusM
    setIsOutsideStorm(outside)
    isOutsideRef.current = outside
  }, [safeRadiusM, geoPos, game?.storm_center_lat, game?.storm_center_lng])

  // ── ダメージティック ───────────────────────────────────────────────────────
  const handleTick = useCallback(async () => {
    if (!isOutsideRef.current || !session || !game) return
    try {
      await stormDamage({
        playerId: session.playerId,
        deviceId: session.deviceId,
        gameId:   game.id,
      })
    } catch { /* ネットワークエラーは無視 */ }
  }, [session, game])

  useEffect(() => {
    if (!enabled) {
      if (tickRef.current) clearInterval(tickRef.current)
      return
    }
    tickRef.current = setInterval(handleTick, STORM_TICK_MS)
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
    }
  }, [enabled, handleTick])

  return { safeRadiusM, isOutsideStorm, isShrinking }
}
