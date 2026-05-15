'use server'

/**
 * shootingActions — シューティングモード専用 Server Actions
 *
 * セキュリティモデル:
 *   - すべての mutating アクションは device_id でプレイヤーを認証
 *   - スコア計算は RPC（register_shooting_hit）内で原子的に実行
 *   - kind ごとのステータスは RPC 内で再計算（クライアント改ざん防止）
 */

import { createServerClient } from '@/lib/supabase/server'
import {
  SHOOTING_INDOOR, SHOOTING_OUTDOOR, shootingEnvConfig,
} from '@/lib/game/constants'
import type { ShootingEnvironment, ShootingTargetKind } from '@/types/database'

// ─────────────────────────────────────────────────────────────────────────────
// 初期化（startGame から呼ばれる）
// ─────────────────────────────────────────────────────────────────────────────

export async function initShootingMode(params: {
  gameId:      string
  environment: ShootingEnvironment
}): Promise<void> {
  const { gameId, environment } = params
  const cfg      = shootingEnvConfig(environment)
  const supabase = createServerClient()
  const { error } = await supabase.rpc('init_shooting_mode', {
    p_game_id:  gameId,
    p_mag_size: cfg.magSize,
  })
  if (error) throw new Error('シューティング初期化に失敗しました')
}

// ─────────────────────────────────────────────────────────────────────────────
// ターゲットスポーン（各クライアントが自分の周辺に湧かせる）
// ─────────────────────────────────────────────────────────────────────────────

export async function spawnShootingTarget(params: {
  gameId:      string
  playerId:    string
  deviceId:    string
  kind:        ShootingTargetKind
  bearingDeg:  number
  distM:       number
  environment: ShootingEnvironment
}): Promise<{ id?: string; error?: string }> {
  const { gameId, playerId, deviceId, kind, bearingDeg, distM, environment } = params
  const cfg      = shootingEnvConfig(environment)
  const supabase = createServerClient()

  // 弾丸トラベルタイム: Outdoor のみ距離に応じた線形補正
  const travelMs = environment === 'outdoor'
    ? Math.round((cfg.travelMs * Math.max(0, distM - cfg.minRangeM)) /
                  Math.max(1, cfg.maxRangeM - cfg.minRangeM))
    : 0

  const { data, error } = await supabase.rpc('spawn_shooting_target', {
    p_game_id:     gameId,
    p_player_id:   playerId,
    p_device_id:   deviceId,
    p_kind:        kind,
    p_bearing:     bearingDeg,
    p_dist_m:      distM,
    p_lifetime_ms: cfg.targetLifetimeMs,
    p_travel_ms:   travelMs,
  })
  if (error) return { error: error.message }
  const result = data as { id?: string; error?: string }
  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// 命中（タップ・BT・AUTO のすべてから呼ばれる）
// ─────────────────────────────────────────────────────────────────────────────

export interface ShootingHitResult {
  killed?:    boolean
  score?:     number
  combo?:     number
  ammo?:      number
  kind?:      ShootingTargetKind
  error?:     string
}

export async function registerShootingHit(params: {
  gameId:      string
  playerId:    string
  deviceId:    string
  targetId:    string
  environment: ShootingEnvironment
}): Promise<ShootingHitResult> {
  const { gameId, playerId, deviceId, targetId, environment } = params
  const cfg      = shootingEnvConfig(environment)
  const supabase = createServerClient()

  const { data, error } = await supabase.rpc('register_shooting_hit', {
    p_game_id:        gameId,
    p_player_id:      playerId,
    p_device_id:      deviceId,
    p_target_id:      targetId,
    p_combo_bonus:    cfg.comboBonus,
    p_distance_bonus: environment === 'outdoor' ? SHOOTING_OUTDOOR.distanceBonus : 0,
    p_min_range_m:    cfg.minRangeM,
  })
  if (error) return { error: error.message }
  return data as ShootingHitResult
}

/** レティクル外でトリガーされた空撃ち（弾を消費 + コンボリセット） */
export async function registerShootingMiss(params: {
  playerId:    string
  deviceId:    string
  environment: ShootingEnvironment
}): Promise<{ ammo?: number; error?: string }> {
  const { playerId, deviceId, environment } = params
  const cfg      = shootingEnvConfig(environment)
  const supabase = createServerClient()
  const { data, error } = await supabase.rpc('register_shooting_miss', {
    p_player_id:    playerId,
    p_device_id:    deviceId,
    p_miss_penalty: cfg.missPenalty,
  })
  if (error) return { error: error.message }
  return data as { ammo?: number; error?: string }
}

// ─────────────────────────────────────────────────────────────────────────────
// 期限切れ（クライアント側で expires_at 到達を検知）
// ─────────────────────────────────────────────────────────────────────────────

export async function expireShootingTarget(params: {
  playerId:    string
  deviceId:    string
  targetId:    string
  environment: ShootingEnvironment
}): Promise<void> {
  const { playerId, deviceId, targetId, environment } = params
  const cfg      = shootingEnvConfig(environment)
  const supabase = createServerClient()
  await supabase.rpc('expire_shooting_target', {
    p_player_id:     playerId,
    p_device_id:     deviceId,
    p_target_id:     targetId,
    p_combo_penalty: cfg.expirePenalty,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// リロード
// ─────────────────────────────────────────────────────────────────────────────

export async function triggerShootingReload(params: {
  playerId:    string
  deviceId:    string
  environment: ShootingEnvironment
}): Promise<{ reloadUntil?: string; error?: string }> {
  const { playerId, deviceId, environment } = params
  const cfg      = shootingEnvConfig(environment)
  const supabase = createServerClient()
  const { data, error } = await supabase.rpc('trigger_shooting_reload', {
    p_player_id: playerId,
    p_device_id: deviceId,
    p_reload_ms: cfg.reloadMs,
  })
  if (error) return { error: error.message }
  const r = data as { reload_until?: string; error?: string }
  return { reloadUntil: r.reload_until, error: r.error }
}

export async function finishShootingReload(params: {
  playerId:    string
  deviceId:    string
  environment: ShootingEnvironment
}): Promise<{ ammo?: number; error?: string }> {
  const { playerId, deviceId, environment } = params
  const cfg      = shootingEnvConfig(environment)
  const supabase = createServerClient()
  const { data, error } = await supabase.rpc('finish_shooting_reload', {
    p_player_id: playerId,
    p_device_id: deviceId,
    p_mag_size:  cfg.magSize,
  })
  if (error) return { error: error.message }
  return data as { ammo?: number }
}

// ─────────────────────────────────────────────────────────────────────────────
// 最終スコア確定
// ─────────────────────────────────────────────────────────────────────────────

export async function commitShootingScore(params: { gameId: string }): Promise<void> {
  const supabase = createServerClient()
  await supabase.rpc('commit_shooting_score', { p_game_id: params.gameId })
}

// 環境別 hit 角度を返すヘルパ（クライアントが Reticle 表示判定に使う）
export async function getShootingEnvHitAngle(environment: ShootingEnvironment): Promise<number> {
  return environment === 'indoor' ? SHOOTING_INDOOR.hitAngleDeg : SHOOTING_OUTDOOR.hitAngleDeg
}
