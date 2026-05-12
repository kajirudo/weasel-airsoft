'use client'

/**
 * useObjectives — ゲームオブジェクトのリアルタイム購読 + 近接判定フック
 *
 * - game_objectives テーブルの変化を Realtime で受信
 * - プレイヤーの GPS 位置から各オブジェクトまでの距離を計算
 * - 近接オブジェクト（操作可能）を種別ごとに分類して返す
 */

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  CLAIM_RADIUS_M,
  GENERATOR_RADIUS_M,
  CAPTURE_RADIUS_M,
} from '@/lib/game/constants'
import type { GameObjective } from '@/types/database'
import type { GeoPosition } from '@/hooks/useRadar'

export interface ObjectiveWithDist extends GameObjective {
  distM: number | null   // null = GPS 未取得
}

export interface NearbyObjectives {
  items:         ObjectiveWithDist[]   // medkit / damage_boost（未獲得）
  generators:    ObjectiveWithDist[]   // 未起動の発電機
  controlPoints: ObjectiveWithDist[]   // 拠点（常に返す）
}

interface UseObjectivesParams {
  gameId:  string | null
  geoPos:  GeoPosition | null
  enabled: boolean
}

function geoDistM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dlat = (a.lat - b.lat) * 111_320
  const dlng = (a.lng - b.lng) * 111_320 * Math.cos(a.lat * Math.PI / 180)
  return Math.sqrt(dlat ** 2 + dlng ** 2)
}

export function useObjectives({ gameId, geoPos, enabled }: UseObjectivesParams) {
  const [objectives, setObjectives] = useState<GameObjective[]>([])
  const supabase = createClient()
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // ── 初回フェッチ ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !gameId) { setObjectives([]); return }

    supabase
      .from('game_objectives')
      .select('*')
      .eq('game_id', gameId)
      .then(({ data }: { data: GameObjective[] | null }) => { if (data) setObjectives(data) })

    // ── Realtime 購読 ──────────────────────────────────────────────────────────
    const channel = supabase
      .channel(`objectives:${gameId}`)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'game_objectives',
          filter: `game_id=eq.${gameId}`,
        },
        (payload: {
          eventType: 'INSERT' | 'UPDATE' | 'DELETE'
          new: GameObjective
          old: Partial<GameObjective>
        }) => {
          if (payload.eventType === 'INSERT') {
            setObjectives(prev => [...prev, payload.new])
          } else if (payload.eventType === 'UPDATE') {
            setObjectives(prev =>
              prev.map(o => o.id === payload.new.id ? payload.new : o)
            )
          } else if (payload.eventType === 'DELETE') {
            setObjectives(prev =>
              prev.filter(o => o.id !== payload.old.id)
            )
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
    distM: geoPos ? geoDistM(geoPos, obj) : null,
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
  }

  return { objectives: objectivesWithDist, nearbyObjectives }
}
