'use client'

import { useEffect, useRef } from 'react'
import { STAMPS, type ChatMessage, type Stamp } from '@/hooks/useGameChat'

interface ChatPanelProps {
  messages:    ChatMessage[]
  unreadCount: number
  isPanelOpen: boolean
  onOpen:      () => void
  onClose:     () => void
  onSendStamp: (stamp: Stamp) => void
}

/**
 * 右下固定のスタンプチャットパネル。
 * トグルボタンで開閉。未読バッジ付き。
 */
export function ChatPanel({
  messages, unreadCount, isPanelOpen, onOpen, onClose, onSendStamp,
}: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // 新メッセージで自動スクロール
  useEffect(() => {
    if (isPanelOpen) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isPanelOpen])

  return (
    <div className="absolute bottom-24 right-3 z-30 flex flex-col items-end gap-2">
      {/* チャットパネル本体 */}
      {isPanelOpen && (
        <div className="w-52 bg-black/80 backdrop-blur-sm rounded-2xl overflow-hidden flex flex-col">
          {/* メッセージログ */}
          <div className="max-h-36 overflow-y-auto px-3 py-2 space-y-1.5 flex flex-col">
            {messages.length === 0 && (
              <p className="text-gray-600 text-xs text-center py-2">スタンプを送ってみよう</p>
            )}
            {messages.map((m) => (
              <div key={m.id} className="flex items-center gap-1.5 text-xs">
                <span className="text-gray-400 truncate max-w-[80px]">{m.playerName}</span>
                <span className="text-xl leading-none">{m.stamp}</span>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* スタンプボタン */}
          <div className="border-t border-gray-800 px-2 py-2 grid grid-cols-6 gap-1">
            {STAMPS.map((stamp) => (
              <button
                key={stamp}
                onClick={() => onSendStamp(stamp)}
                className="text-xl leading-none aspect-square flex items-center justify-center rounded-lg hover:bg-white/10 active:scale-90 transition-transform"
                aria-label={stamp}
              >
                {stamp}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* トグルボタン */}
      <button
        onClick={isPanelOpen ? onClose : onOpen}
        className="relative w-11 h-11 bg-black/70 backdrop-blur-sm border border-gray-700 rounded-full flex items-center justify-center text-xl active:scale-90 transition-transform"
        aria-label="チャット"
      >
        💬
        {unreadCount > 0 && !isPanelOpen && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-white text-xs font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
    </div>
  )
}
