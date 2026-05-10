'use client'

import { usePlayerRealtime } from '@/hooks/usePlayerRealtime'
import type { QrCodeId } from '@/types/database'

const QR_LABELS: Record<QrCodeId, string> = {
  player_1: 'P1',
  player_2: 'P2',
  player_3: 'P3',
  player_4: 'P4',
  player_5: 'P5',
}

interface PlayerListProps {
  gameId: string
}

export function PlayerList({ gameId }: PlayerListProps) {
  const { players, realtimeStatus } = usePlayerRealtime(gameId)
  const isConnected = realtimeStatus === 'connected'

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          参加プレイヤー ({players.length}/5)
        </h3>
        <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-yellow-400 animate-pulse'}`} />
      </div>

      <div className="space-y-2">
        {players.map((p) => (
          <div key={p.id} className="flex items-center gap-3 bg-gray-800 rounded-lg px-4 py-2">
            <span className="text-xs font-mono bg-gray-700 px-2 py-1 rounded text-green-400">
              {QR_LABELS[p.qr_code_id]}
            </span>
            <span className="text-white font-medium">{p.name}</span>
          </div>
        ))}
        {players.length === 0 && (
          <p className="text-gray-500 text-sm text-center py-4">プレイヤーを待っています...</p>
        )}
      </div>
    </div>
  )
}
