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
 *
 * Fix: playerId は ref で保持し useEffect の deps から外す。
 *      session 復元のたびにチャンネルを再購読してしまい、
 *      その隙間に届いた killcam を取りこぼすバグを修正。
 */
export function useKillcam(gameId: string, playerId: string | undefined) {
  const [killcam, setKillcam] = useState<KillcamData | null>(null)

  // playerId を ref で持つことで購読を壊さずに最新値を参照できる
  const playerIdRef = useRef<string | undefined>(playerId)
  useEffect(() => { playerIdRef.current = playerId }, [playerId])

  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)

  useEffect(() => {
    if (!gameId) return
    const supabase = createClient()

    const channel = supabase
      .channel(CHANNEL_NAME(gameId), { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'killcam' }, ({ payload }: { payload: KillcamData }) => {
        // ref 経由で最新の playerId を参照（stale closure なし）
        if (playerIdRef.current && payload.targetPlayerId === playerIdRef.current) {
          setKillcam(payload)
        }
      })
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [gameId])  // ← playerId を deps から除去。ref で最新値を取得するため不要。

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
