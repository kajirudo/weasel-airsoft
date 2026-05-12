import type { QrCodeId } from '@/types/database'

// ── マーカーモード ────────────────────────────────────────────────────────────
/** QR コードモード（〜5m）または ArUco モード（〜12m）*/
export type MarkerMode = 'qr' | 'aruco'
export const MARKER_MODE_KEY     = 'weasel_marker_mode'
export const DEFAULT_MARKER_MODE: MarkerMode = 'qr'

// ── ArUco 4x4_50 辞書: プレイヤー 1〜6 に対応するマーカー定義 ────────────────
// bytes[0-1]: 16 ビット（MSB 先頭・行優先）で 4×4 内部セルを表す
//   1=白セル、0=黒セル
// js-aruco の codeList と同じエンコード
export const ARUCO_MARKERS = [
  { id: 0, bytes: [214, 119] as [number, number] },  // player_1
  { id: 1, bytes: [22,  121] as [number, number] },  // player_2
  { id: 2, bytes: [37,  108] as [number, number] },  // player_3
  { id: 3, bytes: [198,  76] as [number, number] },  // player_4
  { id: 4, bytes: [74,  195] as [number, number] },  // player_5
  { id: 5, bytes: [26,   85] as [number, number] },  // player_6
] as const

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
