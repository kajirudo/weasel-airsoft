'use client'

/**
 * useNPC — game_npcs テーブルを Realtime 購読し、NPC の派生状態を返す。
 *
 * 返却値のうち isBeingLockedOn / lockonProgress は自分がターゲットの場合のみ true/非0。
 * canAttack / isBehind は背後攻撃ボタンの表示制御に使う。
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient }  from '@/lib/supabase/client'
import type { GameNpc }  from '@/types/database'
import type { GeoPosition } from '@/hooks/useRadar'
import {
  HUNTING_BACKSTAB_RANGE_M, HUNTING_BACKSTAB_ANGLE,
  HUNTING_ATTACK_COOLDOWN_MS, HUNTING_CONTROLLER_TTL_MS,
} from '@/lib/game/constants'
import { geoDistM, bearingDeg, normAngle } from '@/lib/game/geo'
// Re-export geo utilities so useNPCController can import from one place
export { geoDistM, bearingDeg, normAngle }

export interface NPCState {
  npc:              GameNpc | null
  /** 自分から NPC までの距離（m）。GPS 不明時は null */
  distM:            number | null
  /** 自分が NPC のロックオンターゲット */
  isBeingLockedOn:  boolean
  /** ロックオン進捗 0〜1（自分がターゲット時のみ有効） */
  lockonProgress:   number
  /** NPC がスタン中 */
  isStunned:        boolean
  /** NPC が混乱（見失い）中 */
  isConfused:       boolean
  /** ランジ予告中 */
  isLungeArming:    boolean
  /** ランジ発動秒読み進捗 0〜1 */
  lungeProgress:    number
  /** 自分が背後攻撃できる（背後 + 射程内 + クールダウン終了） */
  canAttack:        boolean
  /** 自分が NPC の背後にいる */
  isBehind:         boolean
  /** 背後攻撃クールダウン残秒（0 なら攻撃可能） */
  cooldownLeft:     number
  /** NPC コントローラーが不在（引き継ぎ判定に使用） */
  needsController:  boolean
  realtimeStatus:   string
}

interface UseNPCParams {
  gameId:         string | undefined
  selfPlayerId:   string | undefined
  selfDeviceId?:  string
  geoPos:         GeoPosition | null
  lastAttackAt:   string | null   // player.npc_attack_last_at
  enabled:        boolean
}

export function useNPC({
  gameId, selfPlayerId, geoPos, lastAttackAt, enabled,
}: UseNPCParams): NPCState {
  const [npc,    setNpc]    = useState<GameNpc | null>(null)
  const [status, setStatus] = useState('connecting')
  const [tick,   setTick]   = useState(0)   // 毎秒 re-render して進捗計算を更新
  const npcRef = useRef<GameNpc | null>(null)
  npcRef.current = npc

  // 初回取得
  useEffect(() => {
    if (!enabled || !gameId) return
    const supabase = createClient()
    supabase.from('game_npcs').select('*').eq('game_id', gameId).single()
      .then(({ data }: { data: GameNpc | null }) => { if (data) setNpc(data) })
  }, [enabled, gameId])

  // Realtime 購読
  useEffect(() => {
    if (!enabled || !gameId) return
    const supabase = createClient()
    const ch = supabase
      .channel(`npc:${gameId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'game_npcs',
        filter: `game_id=eq.${gameId}`,
      }, (payload: { new: GameNpc | Record<string, unknown> }) => {
        if (payload.new) setNpc(payload.new as GameNpc)
      })
      .subscribe((s: string) => setStatus(s))
    return () => { supabase.removeChannel(ch) }
  }, [enabled, gameId])

  // 毎秒 tick で進捗を更新（ロックオン・ランジ）
  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => setTick(t => t + 1), 200)
    return () => clearInterval(id)
  }, [enabled])

  // ── 派生状態計算 ──────────────────────────────────────────────────────────
  const now = Date.now()

  // 自分の GPS が NPC との距離計算に使える
  const distM: number | null = (() => {
    if (!npc?.lat || !npc?.lng || !geoPos) return null
    return geoDistM(geoPos, { lat: npc.lat, lng: npc.lng })
  })()

  const isBeingLockedOn = !!(
    npc?.lockon_target_id === selfPlayerId &&
    npc?.lockon_start_at
  )

  const lockonProgress: number = (() => {
    if (!isBeingLockedOn || !npc?.lockon_start_at) return 0
    const elapsed = now - new Date(npc.lockon_start_at).getTime()
    return Math.min(1, elapsed / (npc.lockon_seconds * 1000))
  })()

  const isStunned   = !!(npc?.stun_until    && new Date(npc.stun_until).getTime()    > now)
  const isConfused  = !!(npc?.confused_until && new Date(npc.confused_until).getTime() > now)
  const isLungeArming = !!(npc?.lunge_fire_at && new Date(npc.lunge_fire_at).getTime() > now)

  const lungeProgress: number = (() => {
    if (!isLungeArming || !npc?.lunge_armed_at || !npc?.lunge_fire_at) return 0
    const total   = new Date(npc.lunge_fire_at).getTime() - new Date(npc.lunge_armed_at).getTime()
    const elapsed = now - new Date(npc.lunge_armed_at).getTime()
    return Math.min(1, Math.max(0, elapsed / total))
  })()

  // 背後判定
  const isBehind: boolean = (() => {
    if (!npc?.lat || !npc?.lng || !geoPos || distM == null) return false
    if (distM > HUNTING_BACKSTAB_RANGE_M) return false
    const bearing    = bearingDeg({ lat: npc.lat, lng: npc.lng }, geoPos)
    const rearBearing = (npc.heading + 180) % 360
    return Math.abs(normAngle(bearing - rearBearing)) <= HUNTING_BACKSTAB_ANGLE
  })()

  // クールダウン
  const cooldownLeft: number = (() => {
    if (!lastAttackAt) return 0
    const left = HUNTING_ATTACK_COOLDOWN_MS - (now - new Date(lastAttackAt).getTime())
    return Math.max(0, Math.ceil(left / 1000))
  })()

  const canAttack = isBehind && cooldownLeft === 0 && !isStunned && !!distM && distM <= HUNTING_BACKSTAB_RANGE_M

  // コントローラー不在チェック
  const needsController = (() => {
    if (!npc?.controller_heartbeat) return true
    return now - new Date(npc.controller_heartbeat).getTime() > HUNTING_CONTROLLER_TTL_MS
  })()

  // tick 依存なし: distM/isBeingLockedOn は npc + geoPos から即計算されている
  void tick  // eslint警告回避

  return {
    npc, distM, isBeingLockedOn, lockonProgress,
    isStunned, isConfused, isLungeArming, lungeProgress,
    canAttack, isBehind, cooldownLeft, needsController,
    realtimeStatus: status,
  }
}
