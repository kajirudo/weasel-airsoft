'use client'

import type { GameNpc } from '@/types/database'

interface Props {
  npc:     GameNpc
  visible: boolean
}

function hpColor(pct: number): string {
  if (pct > 0.6) return 'bg-green-500'
  if (pct > 0.3) return 'bg-yellow-400'
  return 'bg-red-500'
}

/** ゲーム画面上部中央に表示する NPC HP バー */
export function NPCStatus({ npc, visible }: Props) {
  if (!visible) return null

  const pct        = npc.hp / npc.max_hp
  const isStunned  = !!(npc.stun_until    && new Date(npc.stun_until).getTime()    > Date.now())
  const isConfused = !!(npc.confused_until && new Date(npc.confused_until).getTime() > Date.now())

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[65] pointer-events-none">
      <div className="bg-black/75 backdrop-blur-sm rounded-xl px-4 py-2 flex flex-col items-center gap-1 min-w-[160px]">
        <div className="flex items-center gap-2">
          <span className={`text-xl ${isStunned ? 'animate-spin' : isConfused ? 'animate-bounce' : ''}`}>
            👹
          </span>
          <span className="text-white text-xs font-black tracking-wider">青鬼</span>
          {isStunned && (
            <span className="text-yellow-300 text-[10px] font-bold animate-pulse">STUN</span>
          )}
          {isConfused && !isStunned && (
            <span className="text-blue-300 text-[10px] font-bold animate-pulse">？？？</span>
          )}
        </div>

        {/* HP バー */}
        <div className="w-full h-2.5 bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${hpColor(pct)}`}
            style={{ width: `${pct * 100}%` }}
          />
        </div>
        <p className="text-gray-400 text-[10px] font-mono">
          {npc.hp} / {npc.max_hp}
        </p>
      </div>
    </div>
  )
}
