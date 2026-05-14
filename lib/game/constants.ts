import type { QrCodeId, MarkerMode, GameMode, BotBehavior } from '@/types/database'
export type { MarkerMode, GameMode, BotBehavior }

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
/** デフォルト射撃クールダウン（ms）。DB から上書きされる。 */
export const DEFAULT_SHOOT_COOLDOWN = 800
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
  bot_1: 'CPU', bot_2: 'CPU', bot_3: 'CPU',
  bot_4: 'CPU', bot_5: 'CPU', bot_6: 'CPU', bot_7: 'CPU', bot_8: 'CPU',
}

// ── ゲームモード ──────────────────────────────────────────────────────────────
export const GAME_MODE_LABELS: Record<GameMode, string> = {
  battle:   '🌀 バトル（戦って勝ち残れ）',
  survival: '🔦 サバイバル（Hunter vs Survivors）',
  tactics:  '🏴 タクティクス（拠点争奪）',
  traitor:  '🕵️ スパイ（スパイを探せ）',
  hunting:  '👹 ハンティング（NPC討伐）',
}

// ── Traitor モード ─────────────────────────────────────────────────────────
export const MEETING_DURATION_MS    = 60_000   // 集会の長さ（ms）
export const SABOTAGE_DURATION_MS   = 20_000   // Comms 妨害の継続時間（ms）
export const INVESTIGATE_RADIUS_M   = 15       // Sheriff の調査可能距離（m）
export const TASK_HOLD_MS           = 10_000   // タスク完了に必要なホールド時間（ms）

export const ROLE2_LABELS: Record<import('@/types/database').PlayerRole2, string> = {
  crew:    'CREW',
  traitor: 'SPY',
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

// ── ハンティング（hunting）モード ──────────────────────────────────────────────
export const HUNTING_NPC_HP_BASE       = 300    // 3人以上の基準HP
export const HUNTING_NPC_SPEED_BASE    = 1.5    // 基準移動速度（m/s）
export const HUNTING_LOCKON_SEC_BASE   = 2.0    // ロックオン捕食までの秒数
export const HUNTING_LOCKON_RANGE_M    = 10     // ロックオン開始距離（m）
export const HUNTING_BACKSTAB_RANGE_M  = 15     // 背後攻撃射程（m）
export const HUNTING_BACKSTAB_ANGLE    = 45     // 背後判定角度（±°）
export const HUNTING_BACKSTAB_DAMAGE   = 50     // 背後攻撃ダメージ
export const HUNTING_STUN_SEC          = 10     // スタン時間（s）
export const HUNTING_CONFUSED_SEC      = 5      // 見失い停止時間（s）
export const HUNTING_ATTACK_COOLDOWN_MS = 30_000 // プレイヤー別攻撃クールダウン
export const HUNTING_LUNGE_INTERVAL_S  = 30     // ランジ周期（s）
export const HUNTING_LUNGE_WARN_SEC    = 2      // ランジ予告時間（s）
export const HUNTING_LUNGE_RADIUS_M    = 5      // ランジ捕食半径（m）
export const HUNTING_SEAL_COUNT        = 5      // 封印QR数（デフォルト）
export const HUNTING_CONTROLLER_TTL_MS = 10_000 // コントローラー heartbeat タイムアウト
export const HUNTING_MOVE_INTERVAL_MS  = 2_000  // NPC 移動ループ間隔
export const HUNTING_OFFLINE_THRESHOLD_MS = 30_000  // オフライン判定（ロックオン除外）

/** ソロ調整: 1人時のNPC弱体化パラメータ */
export const HUNTING_SOLO_HP       = 150
export const HUNTING_SOLO_SPEED    = 1.0
export const HUNTING_SOLO_LOCKON   = 3.0
export const HUNTING_SOLO_LUNGE_S  = 45

/** 2人時の調整 */
export const HUNTING_DUO_HP        = 200
export const HUNTING_DUO_SPEED     = 1.2
export const HUNTING_DUO_LOCKON    = 2.5
export const HUNTING_DUO_LUNGE_S   = 35

/** プレイヤー人数からNPCステータスを決定 */
export function huntingNPCStats(playerCount: number) {
  if (playerCount <= 1) return {
    hp: HUNTING_SOLO_HP, speedMps: HUNTING_SOLO_SPEED,
    lockonSeconds: HUNTING_SOLO_LOCKON, lungeIntervalS: HUNTING_SOLO_LUNGE_S,
  }
  if (playerCount === 2) return {
    hp: HUNTING_DUO_HP, speedMps: HUNTING_DUO_SPEED,
    lockonSeconds: HUNTING_DUO_LOCKON, lungeIntervalS: HUNTING_DUO_LUNGE_S,
  }
  return {
    hp: HUNTING_NPC_HP_BASE, speedMps: HUNTING_NPC_SPEED_BASE,
    lockonSeconds: HUNTING_LOCKON_SEC_BASE, lungeIntervalS: HUNTING_LUNGE_INTERVAL_S,
  }
}

export const QR_COLORS: Record<QrCodeId, string> = {
  player_1: '#ef4444',
  player_2: '#3b82f6',
  player_3: '#22c55e',
  player_4: '#f59e0b',
  player_5: '#a855f7',
  player_6: '#ec4899',
  bot_1: '#94a3b8',
  bot_2: '#94a3b8',
  bot_3: '#94a3b8',
  bot_4: '#94a3b8',
  bot_5: '#94a3b8',
  bot_6: '#94a3b8',
  bot_7: '#94a3b8',
  bot_8: '#94a3b8',
}

// ── ソロプレイ / ボットシステム ────────────────────────────────────────────────
/** ボット名（CPU①〜CPU⑧） */
export const BOT_NAMES = ['CPU①','CPU②','CPU③','CPU④','CPU⑤','CPU⑥','CPU⑦','CPU⑧'] as const

/** ボットが攻撃可能な GPS 距離（m） */
export const BOT_SHOOT_RANGE_M = 15

/** ボット制御ループ間隔（NPC コントローラーと同じ） */
export const BOT_MOVE_INTERVAL_MS = 2_000

/** ボット 1 ステップの移動量計算用（tick 間隔） */
export const BOT_TASK_COMPLETE_MS = 40_000   // crew_bot がタスクを 1 つ完了する間隔

/** 難易度別パラメータ */
export type BotDifficulty = 'easy' | 'normal' | 'hard'

export const BOT_SPEED_MPS: Record<BotDifficulty, number> = {
  easy: 0.7, normal: 1.2, hard: 1.8,
}
export const BOT_ACCURACY: Record<BotDifficulty, number> = {
  easy: 0.35, normal: 0.60, hard: 0.85,
}
/** ボットの射撃クールダウン（ms） */
export const BOT_SHOOT_COOLDOWN_MS: Record<BotDifficulty, number> = {
  easy: 6_000, normal: 4_000, hard: 2_500,
}

export const BOT_DIFFICULTY_LABELS: Record<BotDifficulty, string> = {
  easy:   '😊 かんたん',
  normal: '😐 ふつう',
  hard:   '😈 むずかしい',
}
