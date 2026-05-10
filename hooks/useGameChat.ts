'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export const STAMPS = ['🎯', '💀', '👍', '😂', '🔫', '✋'] as const
export type Stamp = typeof STAMPS[number]

export interface ChatMessage {
  id:         string
  playerName: string
  stamp:      Stamp
  timestamp:  number
}

const MAX_MESSAGES = 8

export function useGameChat(gameId: string, playerName: string | undefined) {
  const [messages,   setMessages]   = useState<ChatMessage[]>([])
  const [unreadCount, setUnread]    = useState(0)
  const [isPanelOpen, setPanelOpen] = useState(false)
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)

  useEffect(() => {
    if (!gameId) return
    const supabase = createClient()

    const channel = supabase.channel(`game:${gameId}:chat`, {
      config: { broadcast: { self: true } },
    })

    channel
      .on('broadcast', { event: 'stamp' }, ({ payload }: { payload: ChatMessage }) => {
        setMessages((prev) => [...prev, payload].slice(-MAX_MESSAGES))
        setPanelOpen((open) => {
          if (!open) setUnread((n) => n + 1)
          return open
        })
      })
      .subscribe()

    channelRef.current = channel

    return () => { supabase.removeChannel(channel) }
  }, [gameId])

  // パネルを開いたら未読をリセット
  const openPanel  = useCallback(() => { setPanelOpen(true);  setUnread(0) }, [])
  const closePanel = useCallback(() => { setPanelOpen(false) },               [])

  const sendStamp = useCallback(async (stamp: Stamp) => {
    if (!channelRef.current || !playerName) return
    const msg: ChatMessage = {
      id:         crypto.randomUUID(),
      playerName,
      stamp,
      timestamp:  Date.now(),
    }
    await channelRef.current.send({ type: 'broadcast', event: 'stamp', payload: msg })
  }, [playerName])

  return { messages, unreadCount, isPanelOpen, openPanel, closePanel, sendStamp }
}
