'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { GameStatus } from '@/types/database'

const HEARTBEAT_INTERVAL_MS = 5_000
const TIMEOUT_SECONDS       = 15

interface UseHeartbeatParams {
  gameId:    string
  playerId:  string | undefined
  deviceId:  string | undefined
  gameStatus: GameStatus | undefined
}

export function useHeartbeat({ gameId, playerId, deviceId, gameStatus }: UseHeartbeatParams) {
  // RPCへの参照を ref に持つことで interval コールバック内で常に最新値を参照
  const paramsRef = useRef({ gameId, playerId, deviceId, gameStatus })
  useEffect(() => {
    paramsRef.current = { gameId, playerId, deviceId, gameStatus }
  })

  useEffect(() => {
    const supabase = createClient()

    async function beat() {
      const { gameId, playerId, deviceId, gameStatus } = paramsRef.current
      if (!playerId || !deviceId) return
      // ロビー中もハートビートを送ることで、ゲーム開始直後からタイムアウト判定が安定する
      if (gameStatus === 'finished') return

      try {
        await supabase.rpc('mark_player_seen', {
          p_player_id:       playerId,
          p_device_id:       deviceId,
          p_timeout_seconds: TIMEOUT_SECONDS,
        })
      } catch {
        // ネットワーク断は無視（次の beat で自動リトライ）
      }
    }

    // 初回は即時送信
    beat()
    const id = setInterval(beat, HEARTBEAT_INTERVAL_MS)
    return () => clearInterval(id)
  }, []) // 意図的に空依存 — paramsRef 経由で常に最新値を参照
}
