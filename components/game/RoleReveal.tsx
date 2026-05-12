'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ROLE2_COLORS, ROLE2_LABELS } from '@/lib/game/constants'
import type { PlayerRole2 } from '@/types/database'

interface Props {
  role2:        PlayerRole2
  /** Traitor の場合は仲間 Traitor の名前一覧 */
  traitorNames: string[]
  /** シェリフの場合の調査回数 */
  investigateUses?: number
  onDone:       () => void
}

const ROLE_DESCRIPTIONS: Record<PlayerRole2, string> = {
  crew:    'タスクをすべて完了させて Traitor を追放しよう',
  traitor: '仲間と協力して Crew を全滅させるか、時間切れまで生き残れ',
  sheriff: 'Crew を守れ。調査で怪しい人物の正体を暴け',
}

const ROLE_ICONS: Record<PlayerRole2, string> = {
  crew:    '👷',
  traitor: '🕵️',
  sheriff: '🔰',
}

export function RoleReveal({ role2, traitorNames, investigateUses = 0, onDone }: Props) {
  const [countdown, setCountdown] = useState(7)
  const color = ROLE2_COLORS[role2]
  // onDone を ref で保持し、重複呼び出しを防ぐフラグ
  const doneRef    = useRef(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const handleDone = useCallback(() => {
    if (doneRef.current) return
    doneRef.current = true
    if (intervalRef.current) clearInterval(intervalRef.current)
    onDone()
  }, [onDone])

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { handleDone(); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [handleDone])

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/90 select-none">
      {/* ロール名 */}
      <div
        className="text-7xl font-black tracking-widest mb-4 animate-pulse"
        style={{ color, textShadow: `0 0 40px ${color}` }}
      >
        {ROLE_ICONS[role2]} {ROLE2_LABELS[role2]}
      </div>

      {/* 説明 */}
      <p className="text-white/80 text-lg text-center px-8 mb-6 max-w-sm">
        {ROLE_DESCRIPTIONS[role2]}
      </p>

      {/* Traitor: 仲間一覧 */}
      {role2 === 'traitor' && traitorNames.length > 1 && (
        <div className="mb-6 bg-red-900/60 rounded-xl p-4 text-center">
          <p className="text-red-300 text-sm font-bold mb-2">🔴 仲間の Traitor</p>
          {traitorNames
            .filter(n => n !== '') // 自分は別途表示
            .map(name => (
              <p key={name} className="text-white font-semibold text-lg">{name}</p>
            ))}
        </div>
      )}

      {/* Sheriff: 調査回数 */}
      {role2 === 'sheriff' && investigateUses > 0 && (
        <div className="mb-6 bg-yellow-900/60 rounded-xl p-4 text-center">
          <p className="text-yellow-300 text-sm font-bold">🔍 調査回数: {investigateUses} 回</p>
          <p className="text-white/60 text-xs mt-1">15m 以内に近づいて使用</p>
        </div>
      )}

      {/* カウントダウン */}
      <div className="flex flex-col items-center gap-1">
        <p className="text-white/40 text-sm">自動で閉じます</p>
        <p className="text-white/60 text-2xl font-mono">{countdown}</p>
        <button
          onPointerDown={handleDone}
          className="mt-3 px-8 py-2 rounded-full text-black font-bold text-sm"
          style={{ backgroundColor: color }}
        >
          OK
        </button>
      </div>
    </div>
  )
}
