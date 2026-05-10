'use client'

import { useState, useEffect, useCallback } from 'react'

export interface KillEvent {
  id:         string
  killerName: string
  victimName: string
}

interface KillFeedProps {
  events: KillEvent[]
}

/**
 * 画面左上に表示されるキルフィード。
 * 各エントリは 4 秒後に自動消滅する。
 */
export function KillFeed({ events }: KillFeedProps) {
  const [visible, setVisible] = useState<KillEvent[]>([])

  useEffect(() => {
    if (events.length === 0) return
    const latest = events[events.length - 1]

    // 新しいイベントを追加（最大5件）
    setVisible((prev) => {
      const already = prev.some((e) => e.id === latest.id)
      if (already) return prev
      return [...prev, latest].slice(-5)
    })

    // 4秒後に消す
    const timer = setTimeout(() => {
      setVisible((prev) => prev.filter((e) => e.id !== latest.id))
    }, 4000)

    return () => clearTimeout(timer)
  }, [events])

  if (visible.length === 0) return null

  return (
    <div className="absolute top-20 left-3 pointer-events-none z-20 flex flex-col gap-1.5">
      {visible.map((e) => (
        <div
          key={e.id}
          className="flex items-center gap-1.5 bg-black/70 backdrop-blur-sm rounded-lg px-2.5 py-1 text-xs"
          style={{ animation: 'killfeed-in 0.25s ease-out' }}
        >
          <span className="text-white font-semibold">{e.killerName}</span>
          <span className="text-red-400 text-base leading-none">💀</span>
          <span className="text-gray-300">{e.victimName}</span>
        </div>
      ))}

      <style>{`
        @keyframes killfeed-in {
          from { opacity: 0; transform: translateX(-8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}

/** ゲームページで使うキルフィード管理フック */
export function useKillFeed() {
  const [events, setEvents] = useState<KillEvent[]>([])

  const addKill = useCallback((victimName: string, killerName: string) => {
    setEvents((prev) => [
      ...prev,
      { id: crypto.randomUUID(), killerName, victimName },
    ])
  }, [])

  return { events, addKill }
}
