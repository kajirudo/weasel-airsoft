'use client'

import { useEffect, useRef, useState } from 'react'
import type { RealtimePostgresChangesPayload, REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import type { Player } from '@/types/database'

export type RealtimeStatus = 'connecting' | 'connected' | 'reconnecting' | 'error'

function toRealtimeStatus(raw: string): RealtimeStatus {
  switch (raw) {
    case 'SUBSCRIBED':    return 'connected'
    case 'CHANNEL_ERROR': return 'error'
    case 'TIMED_OUT':
    case 'CLOSED':        return 'reconnecting'
    default:              return 'connecting'
  }
}

function sortByJoinedAt(players: Player[]): Player[] {
  return [...players].sort((a, b) => a.joined_at.localeCompare(b.joined_at))
}

export function usePlayerRealtime(
  gameId: string,
  onHpChange?: (playerId: string, newHp: number, oldHp: number) => void
) {
  const [players, setPlayers] = useState<Player[]>([])
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('connecting')

  const onHpChangeRef = useRef(onHpChange)
  useEffect(() => {
    onHpChangeRef.current = onHpChange
  })

  useEffect(() => {
    if (!gameId) return
    const supabase = createClient()

    supabase
      .from('players')
      .select('*')
      .eq('game_id', gameId)
      .order('joined_at', { ascending: true })
      .then(({ data }: { data: Player[] | null }) => {
        if (data) setPlayers(data)
      })

    const channel = supabase
      .channel(`game:${gameId}:players`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameId}` },
        (payload: RealtimePostgresChangesPayload<Player>) => {
          if (payload.eventType === 'INSERT') {
            setPlayers((prev) => sortByJoinedAt([...prev, payload.new as Player]))
          }
          if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Player
            const old = payload.old as Partial<Player>
            setPlayers((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
            if (old.hp !== undefined && updated.hp < old.hp) {
              onHpChangeRef.current?.(updated.id, updated.hp, old.hp)
            }
          }
          if (payload.eventType === 'DELETE') {
            setPlayers((prev) => prev.filter((p) => p.id !== (payload.old as Player).id))
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

  return { players, realtimeStatus }
}
