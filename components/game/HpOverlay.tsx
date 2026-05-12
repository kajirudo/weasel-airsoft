'use client'

import type { Player, QrCodeId, Team, GameMode, PlayerRole2 } from '@/types/database'
import { MAX_HP, QR_LABELS, ROLE2_COLORS, ROLE2_LABELS } from '@/lib/game/constants'

const TEAM_COLOR: Record<Team, string> = {
  none: '',
  red:  'text-red-400',
  blue: 'text-blue-400',
}

const TEAM_BAR: Record<Team, string> = {
  none: '',
  red:  'border-l-2 border-red-500',
  blue: 'border-l-2 border-blue-500',
}

function hpColor(hp: number): string {
  if (hp > 60) return 'bg-green-500'
  if (hp > 30) return 'bg-yellow-400'
  return 'bg-red-500'
}

/** Traitor モード: 死亡者のロールバッジ（role2 が公開される） */
function Role2Badge({ role2 }: { role2: PlayerRole2 }) {
  return (
    <span
      className="text-[9px] font-black px-1 rounded leading-none"
      style={{
        backgroundColor: ROLE2_COLORS[role2] + '33',  // 20% 透明
        color:            ROLE2_COLORS[role2],
        border:           `1px solid ${ROLE2_COLORS[role2]}88`,
      }}
    >
      {ROLE2_LABELS[role2]}
    </span>
  )
}

interface HpOverlayProps {
  selfPlayer: Player
  allPlayers: Player[]
  /** ゲームモード（traitor 時に死亡者の role2 を表示） */
  gameMode?:  GameMode
}

export function HpOverlay({ selfPlayer, allPlayers, gameMode }: HpOverlayProps) {
  const enemies      = allPlayers.filter((p) => p.id !== selfPlayer.id)
  const isTeamMode   = selfPlayer.team !== 'none'
  const isTraitor    = gameMode === 'traitor'

  return (
    <>
      {/* 自分のHP — 左下 */}
      <div className="absolute bottom-8 left-4 pointer-events-none">
        <div className={`bg-black/60 rounded-xl px-3 py-2 backdrop-blur-sm min-w-[140px] ${TEAM_BAR[selfPlayer.team]}`}>
          <div className="flex items-center justify-between mb-1">
            <p className="text-white text-xs font-bold truncate max-w-[100px]">{selfPlayer.name}</p>
            <div className="flex items-center gap-1">
              {isTeamMode && (
                <span className={`text-xs font-bold ${TEAM_COLOR[selfPlayer.team]}`}>
                  {selfPlayer.team === 'red' ? '🔴' : '🔵'}
                </span>
              )}
              {selfPlayer.kills > 0 && (
                <span className="text-yellow-400 text-xs font-mono">💀{selfPlayer.kills}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-3 bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${hpColor(selfPlayer.hp)}`}
                style={{ width: `${(selfPlayer.hp / MAX_HP) * 100}%` }}
              />
            </div>
            <span className="text-white text-xs font-mono w-8 text-right">{selfPlayer.hp}</span>
          </div>
        </div>
      </div>

      {/* 相手のHP一覧 — 右上 */}
      {enemies.length > 0 && (
        <div className="absolute top-16 right-4 pointer-events-none flex flex-col gap-2">
          {enemies.map((p) => {
            const isDead       = !p.is_alive
            // Traitor モードでは死亡者のロールを公開
            const showRole2    = isTraitor && isDead
            return (
              <div
                key={p.id}
                className={`bg-black/60 rounded-lg px-2 py-1 backdrop-blur-sm ${TEAM_BAR[p.team]} ${isDead ? 'opacity-40' : ''}`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-mono text-gray-400">{QR_LABELS[p.qr_code_id as QrCodeId]}</span>
                  {isTeamMode && (
                    <span className={`text-xs ${TEAM_COLOR[p.team]}`}>
                      {p.team === 'red' ? '🔴' : '🔵'}
                    </span>
                  )}
                  <span className="text-white text-xs truncate max-w-[52px]">{p.name}</span>
                  {p.kills > 0 && (
                    <span className="text-yellow-400 text-xs font-mono">💀{p.kills}</span>
                  )}
                  {/* 死亡者のロールバッジ（Traitor モードのみ） */}
                  {showRole2 && (
                    <Role2Badge role2={p.role2} />
                  )}
                  {!showRole2 && (
                    <>
                      <div className="w-14 h-2 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${hpColor(p.hp)}`}
                          style={{ width: `${(p.hp / MAX_HP) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-white w-5 text-right">{p.hp}</span>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
