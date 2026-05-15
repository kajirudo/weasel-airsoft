'use client'

/**
 * useShootingMode — タップ式 AR シューター 統括フック
 *
 * ─── 座標モデル ──────────────────────────────────────────────────────────────
 *   ターゲットを画面上の (x%, y%) に配置するタップ式 AR シューター。
 *   旧コンパス／極座標エイムは廃止。
 *   `shooting_targets` テーブルのカラムを以下に再解釈:
 *     bearing_deg → X% (0..100)
 *     dist_m      → Y% (0..100)
 *     drift_dps   → X方向ドリフト (%/sec)。runner/bonus が動く演出に使う。
 *
 * 責務:
 *   - 自分のターゲット Realtime 購読
 *   - 自分のターゲットスポーン（クライアントが画面位置をランダム生成）
 *   - 寿命切れ自動 expire
 *   - 弾倉・リロード管理
 *
 *  「タップで撃つ」ロジックは page.tsx 側で targetTap → registerShootingHit を呼ぶ。
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Player, ShootingTarget, ShootingEnvironment } from '@/types/database'
import {
  SHOOTING_TICK_MS, shootingEnvConfig, pickShootingKind,
} from '@/lib/game/constants'
import {
  spawnShootingTarget, expireShootingTarget,
  triggerShootingReload, finishShootingReload,
} from '@/lib/game/shootingActions'

// ─── 共通: 1秒未満の刻みで now を更新するフック ─────────────────────────────
function useNow(intervalMs = 200): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

// ─── 1. ターゲット購読 ─────────────────────────────────────────────────────
function useShootingTargets(params: {
  gameId:  string | null
  selfId:  string | null
  enabled: boolean
}): ShootingTarget[] {
  const { gameId, selfId, enabled } = params
  const [targets, setTargets] = useState<ShootingTarget[]>([])
  const supabaseRef = useRef(createClient())

  useEffect(() => {
    if (!enabled || !gameId || !selfId) return
    const supabase = supabaseRef.current

    supabase.from('shooting_targets')
      .select('*')
      .eq('game_id', gameId)
      .eq('owner_player_id', selfId)
      .is('killed_at', null)
      .then(({ data }: { data: ShootingTarget[] | null }) => {
        if (data) setTargets(data)
      })

    const channel = supabase
      .channel(`shooting:${gameId}:${selfId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'shooting_targets',
        filter: `owner_player_id=eq.${selfId}`,
      }, (payload: {
        eventType: 'INSERT' | 'UPDATE' | 'DELETE'
        new: ShootingTarget
        old: Partial<ShootingTarget>
      }) => {
        setTargets(prev => {
          if (payload.eventType === 'INSERT') {
            if (prev.some(t => t.id === payload.new.id)) return prev
            return [...prev, payload.new]
          }
          if (payload.eventType === 'UPDATE') {
            const next = payload.new
            if (next.killed_at) return prev.filter(t => t.id !== next.id)
            return prev.map(t => t.id === next.id ? next : t)
          }
          if (payload.eventType === 'DELETE' && payload.old?.id) {
            return prev.filter(t => t.id !== payload.old.id)
          }
          return prev
        })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [enabled, gameId, selfId])

  return targets
}

// ─── 2. スポーン: ランダム画面位置で生成 ───────────────────────────────────
function useShootingSpawner(params: {
  gameId:      string | null
  playerId:    string | null
  deviceId:    string | null
  environment: ShootingEnvironment
  activeCount: number
  enabled:     boolean
}): void {
  const { gameId, playerId, deviceId, environment, activeCount, enabled } = params
  const cfg = shootingEnvConfig(environment)

  const activeRef = useRef(activeCount)
  useEffect(() => { activeRef.current = activeCount }, [activeCount])

  const lastSpawnRef = useRef(0)
  const inflightRef  = useRef(false)

  useEffect(() => {
    if (!enabled || !gameId || !playerId || !deviceId) return
    const id = setInterval(async () => {
      if (inflightRef.current) return
      if (activeRef.current >= cfg.maxActive) return
      const now = Date.now()
      if (now - lastSpawnRef.current < cfg.spawnIntervalMs) return
      lastSpawnRef.current = now
      inflightRef.current  = true
      try {
        // 画面の安全領域 [10..90]% x [25..75]% にランダム配置
        // (上端は HUD/Timer、下端はリロードボタン領域を避ける)
        const x = 10 + Math.random() * 80
        const y = 25 + Math.random() * 50
        const kind = pickShootingKind()
        await spawnShootingTarget({
          gameId, playerId, deviceId, kind,
          bearingDeg: x, distM: y, environment,
        })
      } catch {
        // 失敗は次の tick で再試行
      } finally {
        inflightRef.current = false
      }
    }, SHOOTING_TICK_MS)
    return () => clearInterval(id)
  }, [enabled, gameId, playerId, deviceId, environment,
      cfg.maxActive, cfg.spawnIntervalMs])
}

// ─── 3. 期限切れ自動処理 ───────────────────────────────────────────────────
function useShootingExpiry(params: {
  targets:     ShootingTarget[]
  playerId:    string | null
  deviceId:    string | null
  environment: ShootingEnvironment
  enabled:     boolean
}): void {
  const { targets, playerId, deviceId, environment, enabled } = params
  const firedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!enabled || !playerId || !deviceId) return
    const timers: ReturnType<typeof setTimeout>[] = []
    const now = Date.now()
    for (const t of targets) {
      if (t.killed_at) continue
      if (firedRef.current.has(t.id)) continue
      const expiresMs = new Date(t.expires_at).getTime() - now
      if (expiresMs <= 0) continue
      timers.push(setTimeout(() => {
        firedRef.current.add(t.id)
        expireShootingTarget({
          playerId, deviceId, targetId: t.id, environment,
        }).catch(() => {})
      }, expiresMs + 50))
    }
    return () => timers.forEach(clearTimeout)
  }, [targets, playerId, deviceId, environment, enabled])
}

// ─── 4. リロード管理 ───────────────────────────────────────────────────────
function useShootingReload(params: {
  selfPlayer:  Player | undefined
  playerId:    string | null
  deviceId:    string | null
  environment: ShootingEnvironment
  enabled:     boolean
}) {
  const { selfPlayer, playerId, deviceId, environment, enabled } = params
  const cfg = shootingEnvConfig(environment)
  const now = useNow(120)

  const ammo          = selfPlayer?.shooting_ammo ?? 0
  const reloadUntilMs = selfPlayer?.shooting_reload_until
    ? new Date(selfPlayer.shooting_reload_until).getTime() : 0
  const isReloading   = reloadUntilMs > now
  const reloadProgress = isReloading
    ? Math.max(0, Math.min(1, 1 - (reloadUntilMs - now) / cfg.reloadMs))
    : 0

  const triggeredRef = useRef<string | null>(null)
  useEffect(() => {
    if (!enabled || !playerId || !deviceId) return
    if (ammo > 0) {
      triggeredRef.current = null
      return
    }
    if (isReloading)  return
    const key = `${playerId}:${reloadUntilMs}`
    if (triggeredRef.current === key) return
    triggeredRef.current = key
    triggerShootingReload({ playerId, deviceId, environment }).catch(() => {})
  }, [enabled, ammo, isReloading, playerId, deviceId, environment, reloadUntilMs])

  useEffect(() => {
    if (!enabled || !playerId || !deviceId)         return
    if (!isReloading || reloadUntilMs === 0)        return
    const remaining = reloadUntilMs - Date.now()
    if (remaining < 0)                              return
    const id = setTimeout(() => {
      finishShootingReload({ playerId, deviceId, environment }).catch(() => {})
    }, remaining + 30)
    return () => clearTimeout(id)
  }, [enabled, isReloading, reloadUntilMs, playerId, deviceId, environment])

  const manualReload = useCallback(() => {
    if (!playerId || !deviceId)               return
    if (isReloading)                          return
    if (ammo >= cfg.magSize)                  return
    triggerShootingReload({ playerId, deviceId, environment }).catch(() => {})
  }, [playerId, deviceId, environment, isReloading, ammo, cfg.magSize])

  return { ammo, magSize: cfg.magSize, isReloading, reloadProgress, manualReload, now }
}

// ─── 統括 ──────────────────────────────────────────────────────────────────

interface UseShootingModeParams {
  gameId:      string | null
  playerId:    string | null
  deviceId:    string | null
  selfPlayer:  Player | undefined
  environment: ShootingEnvironment
  enabled:     boolean
}

export interface ShootingState {
  targets:        ShootingTarget[]
  environment:    ShootingEnvironment
  score:          number
  combo:          number
  maxCombo:       number
  ammo:           number
  magSize:        number
  isReloading:    boolean
  reloadProgress: number
  manualReload:   () => void
  now:            number
}

export function useShootingMode(p: UseShootingModeParams): ShootingState {
  const { gameId, playerId, deviceId, selfPlayer, environment, enabled } = p

  const targets = useShootingTargets({ gameId, selfId: playerId, enabled })

  useShootingSpawner({
    gameId, playerId, deviceId, environment,
    activeCount: targets.length, enabled,
  })

  useShootingExpiry({ targets, playerId, deviceId, environment, enabled })

  const reload = useShootingReload({ selfPlayer, playerId, deviceId, environment, enabled })

  return {
    targets,
    environment,
    score:    selfPlayer?.shooting_score     ?? 0,
    combo:    selfPlayer?.shooting_combo     ?? 0,
    maxCombo: selfPlayer?.shooting_max_combo ?? 0,
    ammo:           reload.ammo,
    magSize:        reload.magSize,
    isReloading:    reload.isReloading,
    reloadProgress: reload.reloadProgress,
    manualReload:   reload.manualReload,
    now:            reload.now,
  }
}
