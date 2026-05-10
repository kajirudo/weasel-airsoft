'use client'

import type { Player, QrCodeId, Team } from '@/types/database'
import { MAX_HP } from '@/lib/game/constants'

const QR_LABELS: Record<QrCodeId, string> = {
  player_1: 'P1', player_2: 'P2', player_3: 'P3',
  player_4: 'P4', player_5: 'P5', player_6: 'P6',
}

const TEAM_LABEL: Record<Team, string> = { none: '', red: '🔴', blue: '🔵' }

function hpColor(hp: number) {
  if (hp > 60) return 'bg-green-500'
  if (hp > 30) return 'bg-yellow-400'
  return 'bg-red-500'
}

interface SpectatorViewProps {
  players:    Player[]
  selfPlayer: Player
}

export function SpectatorView({ players, selfPlayer }: SpectatorViewProps) {
  const isTeamMode = players.some((p) => p.team !== 'none')
  const alive      = players.filter((p) => p.is_alive)
  const sorted     = [...players].sort((a, b) => {
    if (a.is_alive !== b.is_alive) return a.is_alive ? -1 : 1
    return b.hp - a.hp
  })

  // チームモード時は赤・青でグループ化して生存状況を表示
  const redAlive  = players.filter((p) => p.team === 'red'  && p.is_alive).length
  const blueAlive = players.filter((p) => p.team === 'blue' && p.is_alive).length

  return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center gap-5 z-50 px-4">
      <div className="text-center space-y-1">
        <p className="text-red-500 font-black text-5xl tracking-widest animate-pulse">
          ELIMINATED
        </p>
        {isTeamMode ? (
          <p className="text-gray-400 text-sm">
            🔴 {redAlive}人 vs 🔵 {blueAlive}人
          </p>
        ) : (
          <p className="text-gray-400 text-sm">
            {alive.length}人が戦闘中 — 観戦中...
          </p>
        )}
      </div>

      <div className="w-full max-w-sm space-y-2">
        {sorted.map((p) => {
          const isSelf = p.id === selfPlayer.id
          return (
            <div
              key={p.id}
              className={`rounded-xl px-3 py-2.5 border transition-opacity ${
                isSelf            ? 'bg-gray-900 border-gray-700 opacity-50' :
                p.team === 'red'  ? 'bg-red-950/40 border-red-900' :
                p.team === 'blue' ? 'bg-blue-950/40 border-blue-900' :
                                    'bg-gray-900 border-gray-700'
              } ${!p.is_alive ? 'opacity-40' : ''}`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-mono text-green-400 font-bold w-5">
                  {QR_LABELS[p.qr_code_id]}
                </span>
                {isTeamMode && <span className="text-sm">{TEAM_LABEL[p.team]}</span>}
                <span className="text-white text-sm font-medium flex-1 truncate">{p.name}</span>
                {isSelf    && <span className="text-xs text-gray-500">(YOU)</span>}
                {!p.is_alive && <span className="text-xs text-red-500 font-bold">DEAD</span>}
                {p.kills > 0 && <span className="text-xs text-yellow-400 font-mono">💀×{p.kills}</span>}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${hpColor(p.hp)}`}
                    style={{ width: `${(p.hp / MAX_HP) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-mono text-gray-300 w-6 text-right">{p.hp}</span>
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-gray-700 text-xs">ゲーム終了後に結果が表示されます</p>
    </div>
  )
}
