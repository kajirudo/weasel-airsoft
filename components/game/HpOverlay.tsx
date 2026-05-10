'use client'

import type { Player, QrCodeId } from '@/types/database'
import { MAX_HP } from '@/lib/game/constants'

const QR_LABELS: Record<QrCodeId, string> = {
  player_1: 'P1',
  player_2: 'P2',
  player_3: 'P3',
  player_4: 'P4',
  player_5: 'P5',
  player_6: 'P6',
}

function hpColor(hp: number): string {
  if (hp > 60) return 'bg-green-500'
  if (hp > 30) return 'bg-yellow-400'
  return 'bg-red-500'
}

interface HpOverlayProps {
  selfPlayer: Player
  allPlayers: Player[]
}

export function HpOverlay({ selfPlayer, allPlayers }: HpOverlayProps) {
  const enemies = allPlayers.filter((p) => p.id !== selfPlayer.id)

  return (
    <>
      {/* 自分のHP — 左下 */}
      <div className="absolute bottom-8 left-4 pointer-events-none">
        <div className="bg-black/60 rounded-xl px-3 py-2 backdrop-blur-sm min-w-[140px]">
          <p className="text-white text-xs font-bold mb-1 truncate max-w-[120px]">{selfPlayer.name}</p>
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
        <div className="absolute top-4 right-4 pointer-events-none flex flex-col gap-2">
          {enemies.map((p) => (
            <div key={p.id} className={`bg-black/60 rounded-lg px-2 py-1 backdrop-blur-sm ${!p.is_alive ? 'opacity-40' : ''}`}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-gray-400">{QR_LABELS[p.qr_code_id]}</span>
                <span className="text-white text-xs truncate max-w-[60px]">{p.name}</span>
                <div className="w-16 h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${hpColor(p.hp)}`}
                    style={{ width: `${(p.hp / MAX_HP) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-mono text-white w-6 text-right">{p.hp}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
