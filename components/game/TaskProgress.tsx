'use client'

import type { Game, Player } from '@/types/database'

interface Props {
  game:           Game
  selfPlayer:     Player | undefined
  visible:        boolean
  meetingActive:  boolean
  onCallMeeting:  () => void
  callingMeeting: boolean
}

export function TaskProgress({ game, selfPlayer, visible, meetingActive, onCallMeeting, callingMeeting }: Props) {
  if (!visible) return null

  const taskDone  = game.task_done
  const taskGoal  = game.task_goal
  const pct       = taskGoal > 0 ? Math.min(100, (taskDone / taskGoal) * 100) : 0
  const hasMeeting = (selfPlayer?.meeting_uses ?? 0) > 0
  const isAlive    = selfPlayer?.is_alive ?? false

  return (
    <div className="fixed top-0 left-0 right-0 z-[70] pointer-events-none">
      {/* タスク進捗バー */}
      <div className="flex items-center gap-2 px-3 pt-2 pb-1 bg-black/60">
        {/* ラベル */}
        <span className="text-white/70 text-xs font-mono whitespace-nowrap">
          タスク
        </span>

        {/* プログレスバー */}
        <div className="flex-1 h-2 bg-white/20 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${pct}%`,
              backgroundColor: pct >= 100 ? '#22c55e' : '#3b82f6',
              boxShadow: pct >= 100 ? '0 0 8px #22c55e' : undefined,
            }}
          />
        </div>

        {/* 数字 */}
        <span className="text-white/70 text-xs font-mono whitespace-nowrap">
          {taskDone}/{taskGoal > 0 ? taskGoal : '?'}
        </span>

        {/* 緊急集会ボタン */}
        {isAlive && !meetingActive && (
          <button
            onPointerDown={onCallMeeting}
            disabled={!hasMeeting || callingMeeting}
            className="pointer-events-auto ml-1 px-2 py-0.5 rounded text-xs font-bold disabled:opacity-40 transition"
            style={{
              backgroundColor: hasMeeting ? '#ef4444' : '#6b7280',
              color: '#fff',
            }}
          >
            {callingMeeting ? '…' : '📢'}
            <span className="ml-0.5">{selfPlayer?.meeting_uses ?? 0}</span>
          </button>
        )}

        {/* 集会中バナー */}
        {meetingActive && (
          <span className="pointer-events-none text-yellow-300 text-xs font-bold animate-pulse">
            🗣 集会中
          </span>
        )}
      </div>
    </div>
  )
}
