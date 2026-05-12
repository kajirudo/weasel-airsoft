import type { QrCodeId, MarkerMode, GameMode } from '@/types/database'
export type { MarkerMode, GameMode }

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

// ── ゲームモード ──────────────────────────────────────────────────────────────
export const GAME_MODE_LABELS: Record<GameMode, string> = {
  battle:   '🌀 バトル（縮小マップ）',
  survival: '🔦 サバイバル（Hunter vs Survivors）',
  tactics:  '🏴 タクティクス（拠点争奪）',
  traitor:  '🕵️ Traitor（Among Us型 心理戦）',
}

// ── Traitor モード ─────────────────────────────────────────────────────────
export const MEETING_DURATION_MS    = 60_000   // 集会の長さ（ms）
export const SABOTAGE_DURATION_MS   = 20_000   // Comms 妨害の継続時間（ms）
export const INVESTIGATE_RADIUS_M   = 15       // Sheriff の調査可能距離（m）
export const TASK_HOLD_MS           = 10_000   // タスク完了に必要なホールド時間（ms）

export const ROLE2_LABELS: Record<import('@/types/database').PlayerRole2, string> = {
  crew:    'CREW',
  traitor: 'TRAITOR',
  sheriff: 'SHERIFF',
}

export const ROLE2_COLORS: Record<import('@/types/database').PlayerRole2, string> = {
  crew:    '#22c55e',
  traitor: '#ef4444',
  sheriff: '#f59e0b',
}

// ── オブジェクト近接判定（m） ─────────────────────────────────────────────────
export const CLAIM_RADIUS_M       = 15   // アイテム獲得可能距離
export const GENERATOR_RADIUS_M   = 15   // 発電機起動可能距離
export const CAPTURE_RADIUS_M     = 10   // 拠点占領可能距離

// ── オブジェクト操作タイマー ─────────────────────────────────────────────────
export const GENERATOR_HOLD_MS    = 10_000  // 発電機起動に必要なホールド時間
export const CAPTURE_HOLD_MS      =  5_000  // 拠点占領に必要なホールド時間

// ── ストーム（バトルモード） ──────────────────────────────────────────────────
export const STORM_DAMAGE_HP      = 10   // 圏外 1 ティックのダメージ
export const STORM_TICK_MS        = 5_000  // ダメージ間隔
export const STORM_START_FRACTION = 0.20   // 全体時間の何割から縮小開始
export const STORM_END_FRACTION   = 0.90   // 何割で最終サイズに到達

// ── サバイバルモード ──────────────────────────────────────────────────────────
export const TERROR_RADIUS_M      = 30   // Hunter が Survivor に警告を出す距離
export const HUNTER_HP            = 200  // Hunter の初期 HP

// ── タクティクスモード スコアリング ───────────────────────────────────────────
/** 拠点を 10 秒保有するごとに 1pt 付与 */
export const SCORE_SECS_PER_POINT = 10
/** ホストクライアントがスコアをコミットする間隔 */
export const SCORE_COMMIT_MS      = 30_000

export const QR_COLORS: Record<QrCodeId, string> = {
  player_1: '#ef4444',
  player_2: '#3b82f6',
  player_3: '#22c55e',
  player_4: '#f59e0b',
  player_5: '#a855f7',
  player_6: '#ec4899',
}
