import type { Player } from '@/types/database'

/**
 * joined_at 順ソート済みの players 配列の先頭がホスト。
 * usePlayerRealtime は joined_at ASC でソートして返す。
 */
export function isHostPlayer(players: Player[], playerId: string | undefined): boolean {
  if (!playerId || players.length === 0) return false
  return players[0].id === playerId
}
