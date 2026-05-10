'use server'

import { createServerClient } from '@/lib/supabase/server'
import { QR_CODE_IDS } from '@/lib/game/constants'
import type { QrCodeId } from '@/types/database'

// ─── Short code generator ──────────────────────────────────────────────────────
const SHORT_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateShortCode(): string {
  const buf = new Uint8Array(6)
  crypto.getRandomValues(buf)
  return Array.from(buf, (b) => SHORT_CODE_CHARS[b % SHORT_CODE_CHARS.length]).join('')
}

export async function createGame(): Promise<{ gameId: string; shortCode: string }> {
  const supabase = createServerClient()
  for (let attempt = 0; attempt < 5; attempt++) {
    const shortCode = generateShortCode()
    const { data, error } = await supabase
      .from('games')
      .insert({ status: 'lobby', short_code: shortCode })
      .select('id, short_code')
      .single()
    if (!error && data) return { gameId: data.id, shortCode: data.short_code as string }
    if (error?.code !== '23505') throw new Error('ゲームの作成に失敗しました')
  }
  throw new Error('ゲームの作成に失敗しました')
}

export async function joinGame(params: {
  gameId: string
  name: string
  deviceId: string
}): Promise<{ playerId: string; qrCodeId: QrCodeId; gameId: string }> {
  const supabase = createServerClient()
  let resolvedGameId = params.gameId.trim()

  if (resolvedGameId.length !== 36) {
    const { data: found, error } = await supabase
      .from('games').select('id')
      .eq('short_code', resolvedGameId.toUpperCase()).single()
    if (error || !found) throw new Error('ゲームが見つかりません（コードを確認してください）')
    resolvedGameId = found.id
  }

  const { name, deviceId } = params
  const { data: game, error: gameError } = await supabase
    .from('games').select('status').eq('id', resolvedGameId).single()
  if (gameError || !game) throw new Error('ゲームが見つかりません')
  if (game.status !== 'lobby') throw new Error('このゲームはすでに開始されています')

  const { data: existing } = await supabase
    .from('players').select('id, qr_code_id')
    .eq('game_id', resolvedGameId).eq('device_id', deviceId).single()
  if (existing) {
    return { playerId: existing.id, qrCodeId: existing.qr_code_id as QrCodeId, gameId: resolvedGameId }
  }

  const { data: usedSlots } = await supabase
    .from('players').select('qr_code_id').eq('game_id', resolvedGameId)
  const used     = new Set((usedSlots ?? []).map((p) => p.qr_code_id))
  const nextSlot = QR_CODE_IDS.find((id) => !used.has(id))
  if (!nextSlot) throw new Error('ゲームが満員です（最大6名）')

  const { data: player, error: insertError } = await supabase
    .from('players')
    .insert({ game_id: resolvedGameId, name, device_id: deviceId, qr_code_id: nextSlot })
    .select('id, qr_code_id').single()
  if (insertError || !player) {
    if (insertError?.code === '23505') throw new Error('スロットが競合しました。もう一度お試しください')
    throw new Error('参加に失敗しました')
  }
  return { playerId: player.id, qrCodeId: player.qr_code_id as QrCodeId, gameId: resolvedGameId }
}

export async function startGame(params: {
  gameId:          string
  hitDamage:       number
  shootCooldown:   number
  durationMinutes: number
  teamMode:        boolean
}): Promise<void> {
  const { gameId, hitDamage, shootCooldown, durationMinutes, teamMode } = params
  const supabase = createServerClient()

  // チームモード時：スロット番号でチーム自動割り当て（奇数=赤、偶数=青）
  if (teamMode) {
    await supabase.from('players').update({ team: 'red' })
      .eq('game_id', gameId).in('qr_code_id', ['player_1', 'player_3', 'player_5'])
    await supabase.from('players').update({ team: 'blue' })
      .eq('game_id', gameId).in('qr_code_id', ['player_2', 'player_4', 'player_6'])
  }

  const { error } = await supabase.from('games').update({
    status:           'active',
    started_at:       new Date().toISOString(),
    hit_damage:       hitDamage,
    shoot_cooldown:   shootCooldown,
    duration_minutes: durationMinutes,
    team_mode:        teamMode,
  }).eq('id', gameId).eq('status', 'lobby')

  if (error) throw new Error('ゲーム開始に失敗しました')
}

export async function createRematch(params: {
  prevGameId: string
}): Promise<{ gameId: string; shortCode: string }> {
  const supabase = createServerClient()
  const { gameId, shortCode } = await createGame()
  await supabase.from('games').update({ next_game_id: gameId }).eq('id', params.prevGameId)
  return { gameId, shortCode }
}

export async function quickMatch(params: {
  name: string
  deviceId: string
}): Promise<{ playerId: string; qrCodeId: QrCodeId; gameId: string }> {
  const supabase = createServerClient()
  const { name, deviceId } = params
  const { data: candidates } = await supabase
    .from('games').select('id').eq('status', 'lobby')
    .order('created_at', { ascending: false }).limit(5)
  for (const game of candidates ?? []) {
    try { return await joinGame({ gameId: game.id, name, deviceId }) } catch { continue }
  }
  const { gameId: newGameId } = await createGame()
  return await joinGame({ gameId: newGameId, name, deviceId })
}

export async function finishGameByTimeout(params: { gameId: string }): Promise<void> {
  const supabase = createServerClient()
  const { error } = await supabase.rpc('finish_game_by_timeout', { p_game_id: params.gameId })
  if (error) throw new Error('タイムアウト処理に失敗しました')
}

interface HitResult {
  newHp:       number
  gameOver:    boolean
  winnerId?:   string
  winnerTeam?: string
  throttled?:  boolean
}

export async function registerHit(params: {
  gameId:          string
  shooterPlayerId: string
  shooterDeviceId: string
  targetQrCodeId:  QrCodeId
}): Promise<HitResult> {
  const { gameId, shooterPlayerId, shooterDeviceId, targetQrCodeId } = params
  const supabase = createServerClient()
  const { data, error } = await supabase.rpc('register_hit', {
    p_game_id:           gameId,
    p_shooter_id:        shooterPlayerId,
    p_shooter_device_id: shooterDeviceId,
    p_target_qr_id:      targetQrCodeId,
  })
  if (error) {
    const msg = error.message
    if (msg.includes('GAME_NOT_ACTIVE'))  throw new Error('ゲームがまだ開始されていません')
    if (msg.includes('SHOOTER_DEAD'))     throw new Error('あなたはすでに倒されています')
    if (msg.includes('SELF_SHOT'))        throw new Error('自分自身は撃てません')
    if (msg.includes('FRIENDLY_FIRE'))    throw new Error('味方は撃てません')
    throw new Error('ヒット登録に失敗しました')
  }
  return {
    newHp:      data.newHp,
    gameOver:   data.gameOver,
    winnerId:   data.winnerId   ?? undefined,
    winnerTeam: data.winnerTeam ?? undefined,
    throttled:  data.throttled  ?? false,
  }
}

// ─── Kill Cam ─────────────────────────────────────────────────────────────────

/**
 * killcam 画像を Supabase Storage にアップロードし、公開 URL を返す。
 * FormData の構造:
 *   file            — JPEG Blob (image/jpeg)
 *   gameId          — ゲームID
 *   targetPlayerId  — 対象プレイヤーID
 */
export async function uploadKillcam(formData: FormData): Promise<string> {
  const file           = formData.get('file')           as File   | null
  const gameId         = formData.get('gameId')         as string | null
  const targetPlayerId = formData.get('targetPlayerId') as string | null

  if (!file || !gameId || !targetPlayerId) {
    throw new Error('uploadKillcam: 必須パラメータが不足しています')
  }

  const supabase = createServerClient()
  const path     = `${gameId}/${targetPlayerId}/${Date.now()}.jpg`

  const { error } = await supabase.storage
    .from('killcam')
    .upload(path, file, { contentType: 'image/jpeg', upsert: false })

  if (error) throw new Error(`Storage upload failed: ${error.message}`)

  const { data } = supabase.storage.from('killcam').getPublicUrl(path)
  return data.publicUrl
}
