import type { QrCodeId } from '@/types/database'

export const MAX_HP = 100
export const HIT_DAMAGE = 25
export const MAX_PLAYERS = 6
export const RETICLE_RADIUS = 80

/** スティッキー検知: QRがレティクルから外れてもこの時間（ms）は射撃可能と見なす */
export const STICKY_GRACE_MS = 200
/** オートファイア: QRをレティクル内に保持してからこの時間（ms）後に自動射撃 */
export const AUTO_FIRE_HOLD_MS = 500

export const QR_CODE_IDS: QrCodeId[] = [
  'player_1',
  'player_2',
  'player_3',
  'player_4',
  'player_5',
  'player_6',
]

export const QR_LABELS: Record<QrCodeId, string> = {
  player_1: 'P1', player_2: 'P2', player_3: 'P3',
  player_4: 'P4', player_5: 'P5', player_6: 'P6',
}

export const QR_COLORS: Record<QrCodeId, string> = {
  player_1: '#ef4444',
  player_2: '#3b82f6',
  player_3: '#22c55e',
  player_4: '#f59e0b',
  player_5: '#a855f7',
  player_6: '#ec4899',
}
