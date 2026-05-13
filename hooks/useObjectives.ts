'use client'

/**
 * useObjectives — ゲームオブジェクトのリアルタイム購読 + 近接判定フック
 *
 * - game_objectives テーブルの変化を Realtime で受信
 * - プレイヤーの GPS 位置から各オブジェクトまでの距離を計算
 * - 近接オブジェクト（操作可能）を種別ごとに分類して返す
 * - 発電機が新たに起動したとき onGeneratorActivated コールバックを呼ぶ
 */

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  CLAIM_RADIUS_M,
  GENERATOR_RADIUS_M,
  CAPTURE_RADIUS_M,
} from '@/lib/game/constants'
import { geoDistM } from '@/lib/game/geo'
import type { GameObjective } from '@/types/database'
import type { GeoPosition } from '@/hooks/useRadar'

export interface ObjectiveWithDist extends GameObjective {
  distM:           number | null   // null = GPS 未取得
  nearbyTeamCount: number          // 拠点の場合: 近くにいる同チームプレイヤー数（クライアント推定）
}

export interface NearbyObjectives {
  items:         ObjectiveWithDist[]   // medkit / damage_boost（未獲得）
  generators:    ObjectiveWithDist[]   // 未起動の発電機
  controlPoints: ObjectiveWithDist[]   // 拠点（CAPTURE_RADIUS_M 内）
  seals:         ObjectiveWithDist[]   // 封印QR（hunting モード・未スキャン）
}

interface UseObjectivesParams {
  gameId:               string | null
  geoPos:               GeoPosition | null
  enabled:              boolean
  /** 発電機が新たに is_activated=true になったとき呼ばれる */
  onGeneratorActivated?: (allActivated: boolean, objectives: GameObjective[]) => void
}

export function useObjectives({
  gameId, geoPos, enabled, onGeneratorActivated,
}: UseObjectivesParams) {
  const [objectives, setObjectives] = useState<GameObjective[]>([])

  // Supabase クライアントは一度だけ生成してキャッシュ
  const supabaseRef  = useRef(createClient())
  const channelRef   = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)
  const prevObjRef   = useRef<Map<string, GameObjective>>(new Map())
  const callbackRef  = useRef(onGeneratorActivated)
  callbackRef.current = onGeneratorActivated

  // ── 初回フェッチ + Realtime 購読 ────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !gameId) { setObjectives([]); return }
    const supabase = supabaseRef.current

    supabase
      .from('game_objectives')
      .select('*')
      .eq('game_id', gameId)
      .then(({ data }: { data: GameObjective[] | null }) => {
        if (!data) return
        setObjectives(data)
        prevObjRef.current = new Map(data.map(o => [o.id, o]))
      })

    const channel = supabase
      .channel(`objectives:${gameId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_objectives', filter: `game_id=eq.${gameId}` },
        (payload: {
          eventType: 'INSERT' | 'UPDATE' | 'DELETE'
          new: GameObjective
          old: Partial<GameObjective>
        }) => {
          if (payload.eventType === 'INSERT') {
            setObjectives(prev => {
              const next = [...prev, payload.new]
              prevObjRef.current.set(payload.new.id, payload.new)
              return next
            })
          } else if (payload.eventType === 'UPDATE') {
            const prev = prevObjRef.current.get(payload.new.id)
            // 発電機: false→true の変化を検知してコールバック
            if (
              payload.new.type === 'generator' &&
              !prev?.is_activated && payload.new.is_activated
            ) {
              setObjectives(current => {
                const next = current.map(o => o.id === payload.new.id ? payload.new : o)
                const allActivated = next
                  .filter(o => o.type === 'generator')
                  .every(o => o.is_activated)
                callbackRef.current?.(allActivated, next)
                prevObjRef.current.set(payload.new.id, payload.new)
                return next
              })
            } else {
              setObjectives(prev2 => {
                prevObjRef.current.set(payload.new.id, payload.new)
                return prev2.map(o => o.id === payload.new.id ? payload.new : o)
              })
            }
          } else if (payload.eventType === 'DELETE') {
            setObjectives(prev => {
              prevObjRef.current.delete(payload.old.id!)
              return prev.filter(o => o.id !== payload.old.id)
            })
          }
        },
      )
      .subscribe()

    channelRef.current = channel
    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [enabled, gameId])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── 距離計算 + 近接判定 ───────────────────────────────────────────────────────
  const objectivesWithDist: ObjectiveWithDist[] = objectives.map(obj => ({
    ...obj,
    distM:           geoPos ? geoDistM(geoPos, obj) : null,
    nearbyTeamCount: 1,   // page.tsx 側でプレイヤー位置から上書きする
  }))

  const nearbyObjectives: NearbyObjectives = {
    items: objectivesWithDist.filter(o =>
      (o.type === 'medkit' || o.type === 'damage_boost') &&
      !o.is_claimed &&
      (o.distM === null || o.distM <= CLAIM_RADIUS_M)
    ),
    generators: objectivesWithDist.filter(o =>
      o.type === 'generator' &&
      !o.is_activated &&
      (o.distM === null || o.distM <= GENERATOR_RADIUS_M)
    ),
    controlPoints: objectivesWithDist.filter(o =>
      o.type === 'control_point' &&
      (o.distM === null || o.distM <= CAPTURE_RADIUS_M)
    ),
    seals: objectivesWithDist.filter(o =>
      o.type === 'seal' &&
      !o.is_claimed &&
      (o.distM === null || o.distM <= GENERATOR_RADIUS_M)
    ),
  }

  return { objectives: objectivesWithDist, nearbyObjectives }
}
