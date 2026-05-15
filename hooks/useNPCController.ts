'use client'

/**
 * useNPCController — NPC の自律移動・ロックオン・ランジを管理するフック。
 *
 * 条件:
 *   - isController === true のクライアントのみ実行
 *   - 2 秒ごとにループし、DB に NPC の状態を書き込む
 *   - controller_heartbeat TTL が切れたら他クライアントが claimController を試みる
 */

import { useEffect, useRef, useCallback } from 'react'
import type { Player, GameNpc } from '@/types/database'
import type { LocalPlayerSession } from '@/types/game'
import {
  HUNTING_MOVE_INTERVAL_MS, HUNTING_LOCKON_RANGE_M,
  HUNTING_OFFLINE_THRESHOLD_MS,
} from '@/lib/game/constants'
import { geoDistM, bearingDeg } from '@/hooks/useNPC'
import { mPerDegree } from '@/lib/game/geo'
import {
  moveNPC, clearLockon, armLunge, fireLunge, cancelLunge, npcCatch, heartbeat,
} from '@/lib/game/npcActions'

interface Props {
  gameId:      string
  session:     LocalPlayerSession | null
  npc:         GameNpc | null
  players:     Player[]
  isController: boolean
  enabled:     boolean   // ゲームが active の場合のみ true
}

export function useNPCController({ gameId, session, npc, players, isController, enabled }: Props) {
  // 最新値を ref で保持して stale closure を防ぐ
  const npcRef      = useRef(npc)
  const playersRef  = useRef(players)
  const sessionRef  = useRef(session)
  npcRef.current    = npc
  playersRef.current = players
  sessionRef.current = session

  /** プレイヤー人数と距離・HPからロックオン優先スコアを計算（低いほど優先） */
  const priorityScore = useCallback((p: Player, distM: number, isCurrentTarget: boolean): number => {
    return distM + (p.hp / 100) * 10 + (isCurrentTarget ? -2 : 0)
  }, [])

  const tick = useCallback(async () => {
    const n   = npcRef.current
    const ps  = playersRef.current
    const ses = sessionRef.current
    if (!n || !ses) return

    const controllerId = ses.playerId
    const now = Date.now()

    // 1. heartbeat 送信（常に）
    heartbeat({ gameId, controllerId }).catch(() => {})

    // 2. スタン中 / 混乱中はスキップ（ランジキャンセルのみ確認）
    const isStunned  = !!(n.stun_until    && new Date(n.stun_until).getTime()    > now)
    const isConfused = !!(n.confused_until && new Date(n.confused_until).getTime() > now)

    if (isStunned) {
      // スタン中はランジをキャンセル
      if (n.lunge_armed_at || n.lunge_fire_at) {
        await cancelLunge({ gameId, controllerId })
      }
      return
    }

    // 3. ランジ発動チェック（予告中で時刻到達）
    if (n.lunge_fire_at && new Date(n.lunge_fire_at).getTime() <= now) {
      await fireLunge({ gameId, controllerId, npcId: n.id })
      return
    }

    // 4. 混乱中はランジのみ（移動しない）
    if (isConfused) return

    // ランジ予告中は静止
    if (n.lunge_armed_at) return

    // 5. NPC の現在位置チェック
    if (n.lat == null || n.lng == null) return

    // 6a. GPS あり生存プレイヤー（移動ターゲット用・last_seen 不問）
    const aliveWithGPS = ps.filter(p =>
      p.is_alive && p.lat != null && p.lng != null && !p.is_bot
    )

    // 6b. ロックオン候補：加えてオフライン除外（heartbeat 未着の場合は last_seen なしも許容）
    const aliveWithPos = aliveWithGPS.filter(p => {
      if (!p.last_seen) return true   // heartbeat 未到着の場合は許容（ゲーム開始直後）
      return now - new Date(p.last_seen).getTime() <= HUNTING_OFFLINE_THRESHOLD_MS
    })

    const candidates = aliveWithPos
      .map(p => ({
        p,
        dist: geoDistM({ lat: n.lat!, lng: n.lng! }, { lat: p.lat!, lng: p.lng! }),
      }))
      .filter(({ dist }) => dist <= HUNTING_LOCKON_RANGE_M)
      .sort((a, b) => {
        const sa = priorityScore(a.p, a.dist, n.lockon_target_id === a.p.id)
        const sb = priorityScore(b.p, b.dist, n.lockon_target_id === b.p.id)
        return sa - sb
      })

    const newTarget = candidates[0] ?? null

    // 7. ロックオン状態の更新
    let lockonTargetId:  string | null = n.lockon_target_id
    let lockonStartAt:   string | null = n.lockon_start_at

    if (newTarget) {
      if (n.lockon_target_id !== newTarget.p.id) {
        // 新規ロックオン
        lockonTargetId = newTarget.p.id
        lockonStartAt  = new Date().toISOString()
      } else {
        // 継続中：2秒経過で捕食
        const elapsed = lockonStartAt ? now - new Date(lockonStartAt).getTime() : 0
        if (elapsed >= n.lockon_seconds * 1000) {
          await npcCatch({ gameId, controllerId, npcId: n.id, targetId: newTarget.p.id })
          return  // 捕食後は次 tick で再評価
        }
      }
    } else {
      // 範囲外になった → ロックオン解除 + 混乱
      if (n.lockon_target_id) {
        await clearLockon({ gameId, controllerId })
        return
      }
      lockonTargetId = null
      lockonStartAt  = null
    }

    // 8. ランジ周期チェック（ロックオン中のみ発動）
    // last_lunge_at が null（初回）のときは now を基準にして即時発動を防ぐ
    const lastLunge = n.last_lunge_at ? new Date(n.last_lunge_at).getTime() : now
    if (
      lockonTargetId &&
      now - lastLunge >= n.lunge_interval_s * 1000 &&
      !n.lunge_armed_at
    ) {
      await armLunge({ gameId, controllerId })
      return
    }

    // 9. 移動（ターゲットへ向かう。いなければ最近接プレイヤーへ）
    const moveTo = newTarget?.p ?? aliveWithGPS
      .map(p => ({ p, dist: geoDistM({ lat: n.lat!, lng: n.lng! }, { lat: p.lat!, lng: p.lng! }) }))
      .sort((a, b) => a.dist - b.dist)[0]?.p ?? null

    if (!moveTo?.lat || !moveTo?.lng) {
      // 生存プレイヤーが誰も GPS 持ってない → 現在地を heartbeat で維持
      return
    }

    const targetLat = moveTo.lat
    const targetLng = moveTo.lng
    const heading   = bearingDeg({ lat: n.lat, lng: n.lng }, { lat: targetLat, lng: targetLng })
    const dtSec     = HUNTING_MOVE_INTERVAL_MS / 1000
    const stepM     = n.speed_mps * dtSec
    const mpd       = mPerDegree(n.lat)
    const newLat = n.lat + (stepM * Math.cos(heading * Math.PI / 180)) / mpd.lat
    const newLng = n.lng + (stepM * Math.sin(heading * Math.PI / 180)) / mpd.lng

    await moveNPC({
      gameId, controllerId,
      newLat, newLng, heading,
      lockonTargetId,
      lockonStartAt,
    })
  }, [gameId, priorityScore])

  useEffect(() => {
    if (!enabled || !isController) return
    // 即時 1 回実行してから周期ループ
    tick()
    const id = setInterval(tick, HUNTING_MOVE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [enabled, isController, tick])
}
