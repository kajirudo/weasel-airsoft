'use client'

import type { RealtimeStatus } from '@/hooks/usePlayerRealtime'

interface ConnectionWarningProps {
  status: RealtimeStatus
}

const MESSAGES: Record<Exclude<RealtimeStatus, 'connected'>, { text: string; color: string }> = {
  connecting:   { text: '接続中...', color: 'bg-blue-500/80' },
  reconnecting: { text: '再接続中... しばらくお待ちください', color: 'bg-yellow-500/80' },
  error:        { text: '通信エラー — 操作は反映されません', color: 'bg-red-600/90' },
}

export function ConnectionWarning({ status }: ConnectionWarningProps) {
  if (status === 'connected') return null

  const { text, color } = MESSAGES[status]

  return (
    <div className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 px-4 py-2 ${color} backdrop-blur-sm`}>
      <span className="w-2 h-2 rounded-full bg-white animate-pulse shrink-0" />
      <p className="text-white text-xs font-semibold text-center">{text}</p>
    </div>
  )
}
