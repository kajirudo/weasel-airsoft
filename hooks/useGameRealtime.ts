'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { RealtimePostgresChangesPayload, REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import type { Game } from '@/types/database'
import type { RealtimeStatus } from './usePlayerRealtime'

function toRealtimeStatus(raw: string): RealtimeStatus {
  switch (raw) {
    case 'SUBSCRIBED':    return 'connected'
    case 'CHANNEL_ERROR': return 'error'
    case 'TIMED_OUT':
    case 'CLOSED':        return 'reconnecting'
    default:              return 'connecting'
  }
}

export function useGameRealtime(gameId: string) {
  const [game, setGame] = useState<Game | null>(null)
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('connecting')
  const router = useRouter()
  // ルーター参照を ref に逃がして useEffect の依存から除外
  const routerRef = useRef(router)
  useEffect(() => { routerRef.current = router })

  useEffect(() => {
    if (!gameId) return
    const supabase = createClient()

    supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .single()
      .then(({ data }: { data: Game | null }) => {
        if (data) setGame(data)
      })

    const channel = supabase
      .channel(`game:${gameId}:status`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        (payload: RealtimePostgresChangesPayload<Game>) => {
          const updated = payload.new as Game
          setGame(updated)
          if (updated.status === 'finished') {
            routerRef.current.push(`/result/${gameId}`)
          }
        }
      )
      .subscribe((status: `${REALTIME_SUBSCRIBE_STATES}`) => {
        setRealtimeStatus(toRealtimeStatus(status))
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameId])

  return { game, realtimeStatus }
}
