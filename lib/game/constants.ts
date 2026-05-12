import type { QrCodeId, MarkerMode } from '@/types/database'
export type { MarkerMode }

// ── マーカーモード ────────────────────────────────────────────────────────────
export const MARKER_MODE_KEY     = 'weasel_marker_mode'
export const DEFAULT_MARKER_MODE: MarkerMode = 'qr'

// ── js-aruco マーカー定義（ID 0〜5 をプレイヤー 1〜6 に割り当て） ──────────────
// ID の意味: js-aruco の 10 ビット Hamming 符号 ID（0〜1023）
// 実際のビットパターンは lib/aruco/generator.ts の idToGrid() で生成する
export const ARUCO_MARKERS: { id: number }[] = [
  { id: 0 },  // player_1
  { id: 1 },  // player_2
  { id: 2 },  // player_3
  { id: 3 },  // player_4
  { id: 4 },  // player_5
  { id: 5 },  // player_6
]

/** ArUco ID (0〜5) → QrCodeId */
export const ARUCO_ID_TO_QR: Record<number, QrCodeId> = {
  0: 'player_1', 1: 'player_2', 2: 'player_3',
  3: 'player_4', 4: 'player_5', 5: 'player_6',
}

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
