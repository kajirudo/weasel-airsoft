'use client'

/**
 * useShootingMode — シューティングモードの統括フック
 *
 * 責務:
 *   - 自分のターゲットを Realtime 購読 (useShootingTargets)
 *   - 自分の周囲にターゲットをスポーン (useShootingSpawner)
 *   - 方位ベースのエイム判定 (useShootingAim)
 *   - 寿命切れターゲットの自動 expire (useShootingExpiry)
 *   - 弾倉・リロード管理 (useShootingReload)
 *
 * 「render 内 Date.now()」は徹底排除。`now` ステート + setInterval で統一。
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Player, ShootingTarget, ShootingEnvironment } from '@/types/database'
import type { GeoPosition } from '@/hooks/useRadar'
import { normAngle } from '@/lib/game/geo'
import {
  SHOOTING_TICK_MS, SHOOTING_INDOOR, SHOOTING_OUTDOOR,
  shootingEnvConfig, pickShootingKind,
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

    // 初回フェッチ
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
            // killed_at がセットされたら除外
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

// ─── 2. スポーン: 自分のクライアントが自分の周辺に湧かせる ─────────────────
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

  // ref で stale closure 回避（effect 内で同期する — render 中の ref 代入は禁止）
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
        const bearing = Math.random() * 360
        const distM   = cfg.minRangeM + Math.random() * (cfg.maxRangeM - cfg.minRangeM)
        const kind    = pickShootingKind()
        await spawnShootingTarget({
          gameId, playerId, deviceId, kind,
          bearingDeg: bearing, distM, environment,
        })
      } catch {
        // 個別の失敗は無視（次の tick で再試行）
      } finally {
        inflightRef.current = false
      }
    }, SHOOTING_TICK_MS)
    return () => clearInterval(id)
  }, [enabled, gameId, playerId, deviceId, environment,
      cfg.maxActive, cfg.spawnIntervalMs, cfg.minRangeM, cfg.maxRangeM])
}

// ─── 3. エイム判定 ─────────────────────────────────────────────────────────
export interface AimedTarget {
  id:       string
  kind:     ShootingTarget['kind']
  distM:    number
  travelMs: number
  hp:       number
  maxHp:    number
}

function useShootingAim(params: {
  targets:     ShootingTarget[]
  geoPos:      GeoPosition | null
  environment: ShootingEnvironment
  now:         number
}): { aimed: AimedTarget | null } {
  const { targets, geoPos, environment, now } = params
  const cfg = shootingEnvConfig(environment)

  const aimed = useMemo<AimedTarget | null>(() => {
    if (!geoPos) return null
    let best: AimedTarget | null = null
    let bestAngle = Infinity
    for (const t of targets) {
      if (t.killed_at) continue
      const expiresAt = new Date(t.expires_at).getTime()
      if (expiresAt <= now) continue
      const spawnAt   = new Date(t.spawn_at).getTime()
      const elapsedS  = (now - spawnAt) / 1000
      const curBear   = (t.bearing_deg + t.drift_dps * elapsedS + 360) % 360
      const rel       = normAngle(curBear - geoPos.heading)
      const eff       = cfg.hitAngleDeg * t.size_factor
      if (Math.abs(rel) > eff) continue
      if (Math.abs(rel) < bestAngle) {
        bestAngle = Math.abs(rel)
        best = {
          id: t.id, kind: t.kind, distM: t.dist_m,
          travelMs: t.travel_ms, hp: t.hp, maxHp: t.max_hp,
        }
      }
    }
    return best
  }, [targets, geoPos, now, cfg.hitAngleDeg])

  return { aimed }
}

// ─── 4. 期限切れ自動処理 ───────────────────────────────────────────────────
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

// ─── 5. リロード管理 ───────────────────────────────────────────────────────
function useShootingReload(params: {
  selfPlayer:  Player | undefined
  playerId:    string | null
  deviceId:    string | null
  environment: ShootingEnvironment
  enabled:     boolean
}) {
  const { selfPlayer, playerId, deviceId, environment, enabled } = params
  const cfg = shootingEnvConfig(environment)
  const now = useNow(150)

  const ammo          = selfPlayer?.shooting_ammo ?? 0
  const reloadUntilMs = selfPlayer?.shooting_reload_until
    ? new Date(selfPlayer.shooting_reload_until).getTime() : 0
  const isReloading   = reloadUntilMs > now
  const reloadProgress = isReloading
    ? Math.max(0, Math.min(1, 1 - (reloadUntilMs - now) / cfg.reloadMs))
    : 0

  // ammo == 0 を検知して自動リロード
  const triggeredRef = useRef<string | null>(null)
  useEffect(() => {
    if (!enabled || !playerId || !deviceId) return
    if (ammo > 0)     return
    if (isReloading)  return
    // 同じ「ammo==0」状態で何度も発火しないようキーで一意化
    const key = `${playerId}:${reloadUntilMs}`
    if (triggeredRef.current === key) return
    triggeredRef.current = key
    triggerShootingReload({ playerId, deviceId, environment }).catch(() => {})
  }, [enabled, ammo, isReloading, playerId, deviceId, environment, reloadUntilMs])

  // reload_until 到達で finishReload
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
    if (ammo >= cfg.magSize)                  return  // 満タンなら不要
    triggerShootingReload({ playerId, deviceId, environment }).catch(() => {})
  }, [playerId, deviceId, environment, isReloading, ammo, cfg.magSize])

  return { ammo, magSize: cfg.magSize, isReloading, reloadProgress, manualReload }
}

// ─── 統括 ──────────────────────────────────────────────────────────────────

interface UseShootingModeParams {
  gameId:      string | null
  playerId:    string | null
  deviceId:    string | null
  selfPlayer:  Player | undefined
  geoPos:      GeoPosition | null
  environment: ShootingEnvironment
  enabled:     boolean
}

export interface ShootingState {
  targets:        ShootingTarget[]
  aimed:          AimedTarget | null
  environment:    ShootingEnvironment
  hitAngleDeg:    number
  // スコア
  score:          number
  combo:          number
  maxCombo:       number
  // 弾倉
  ammo:           number
  magSize:        number
  isReloading:    boolean
  reloadProgress: number
  manualReload:   () => void
  // 内部 now （UI 進捗計算用）
  now:            number
}

export function useShootingMode(p: UseShootingModeParams): ShootingState {
  const { gameId, playerId, deviceId, selfPlayer, geoPos, environment, enabled } = p

  // 共通 now (高頻度) — エイム判定用
  const now = useNow(120)

  const targets = useShootingTargets({ gameId, selfId: playerId, enabled })

  useShootingSpawner({
    gameId, playerId, deviceId, environment,
    activeCount: targets.length, enabled,
  })

  const { aimed } = useShootingAim({ targets, geoPos, environment, now })

  useShootingExpiry({ targets, playerId, deviceId, environment, enabled })

  const reload = useShootingReload({ selfPlayer, playerId, deviceId, environment, enabled })

  return {
    targets,
    aimed,
    environment,
    hitAngleDeg: environment === 'indoor' ? SHOOTING_INDOOR.hitAngleDeg : SHOOTING_OUTDOOR.hitAngleDeg,
    score:    selfPlayer?.shooting_score     ?? 0,
    combo:    selfPlayer?.shooting_combo     ?? 0,
    maxCombo: selfPlayer?.shooting_max_combo ?? 0,
    ammo:           reload.ammo,
    magSize:        reload.magSize,
    isReloading:    reload.isReloading,
    reloadProgress: reload.reloadProgress,
    manualReload:   reload.manualReload,
    now,
  }
}
