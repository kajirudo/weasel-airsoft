'use client'

/**
 * TacticsScore — タクティクスモード スコア表示
 *
 * - Red / Blue チームのスコアを表示
 * - 現在制御中の拠点をインジケーターで表示（🔴/🔵）
 */

import { memo } from 'react'
import type { Game, GameObjective } from '@/types/database'

interface Props {
  game:       Game
  objectives: GameObjective[]
  visible:    boolean   // game_mode === 'tactics' && game.status === 'active'
}

export const TacticsScore = memo(function TacticsScore({ game, objectives, visible }: Props) {
  if (!visible) return null

  const controlPoints = objectives.filter(o => o.type === 'control_point')

  return (
    <div
      className="pointer-events-none fixed top-3 left-1/2 z-30 -translate-x-1/2"
      style={{ minWidth: '12rem' }}
    >
      <div className="flex items-center gap-2 rounded-2xl bg-black/75 px-4 py-2 text-white shadow-lg">
        {/* Red スコア */}
        <span className="text-lg font-black" style={{ color: '#ef4444' }}>
          {game.score_red}
        </span>
        <span className="text-xs text-white/60">RED</span>

        {/* 拠点インジケーター */}
        <div className="flex items-center gap-1 px-1">
          {controlPoints.map(cp => (
            <span
              key={cp.id}
              className="h-3 w-3 rounded-full border border-white/30"
              style={{
                background:
                  cp.controlled_by === 'red'  ? '#ef4444' :
                  cp.controlled_by === 'blue' ? '#3b82f6' :
                  '#4b5563',
              }}
              title={`拠点: ${cp.controlled_by}`}
            />
          ))}
        </div>

        <span className="text-xs text-white/60">BLUE</span>
        {/* Blue スコア */}
        <span className="text-lg font-black" style={{ color: '#3b82f6' }}>
          {game.score_blue}
        </span>
      </div>

      {/* 占領中バッジ */}
      {controlPoints.some(cp => cp.capturing_team) && (
        <div className="mt-1 flex justify-center">
          <span className="rounded-full bg-yellow-500/90 px-2 py-0.5 text-xs font-bold text-black">
            占領進行中…
          </span>
        </div>
      )}
    </div>
  )
})
