'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface KillcamData {
  imageUrl:       string
  shooterName:    string
  timestamp:      string  // ISO string
  targetPlayerId: string
}

const CHANNEL_NAME = (gameId: string) => `game:${gameId}:killcam`

/**
 * useKillcam
 * - 自分が撃たれたときの killcam データを受信して保持する
 * - sendKillcam() で他プレイヤーに向けて killcam データを配信する
 */
export function useKillcam(gameId: string, playerId: string | undefined) {
  const [killcam, setKillcam] = useState<KillcamData | null>(null)
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)

  useEffect(() => {
    if (!gameId) return
    const supabase = createClient()

    const channel = supabase
      .channel(CHANNEL_NAME(gameId), { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'killcam' }, ({ payload }: { payload: KillcamData }) => {
        // 自分が対象のときだけ表示
        if (playerId && payload.targetPlayerId === playerId) {
          setKillcam(payload)
        }
      })
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [gameId, playerId])

  const sendKillcam = useCallback(async (data: KillcamData): Promise<void> => {
    if (!channelRef.current) return
    await channelRef.current.send({
      type:    'broadcast',
      event:   'killcam',
      payload: data,
    })
  }, [])

  const dismiss = useCallback(() => setKillcam(null), [])

  return { killcam, dismiss, sendKillcam }
}
