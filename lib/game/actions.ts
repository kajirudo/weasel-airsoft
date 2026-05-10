'use server'

import { createServerClient } from '@/lib/supabase/server'
import { QR_CODE_IDS } from '@/lib/game/constants'
import type { QrCodeId } from '@/types/database'

// ─── Short code generator ──────────────────────────────────────────────────────
// Avoids ambiguous chars: 0/O, 1/I/l → 32 symbols → 32^6 ≈ 1 billion codes
const SHORT_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateShortCode(): string {
  const buf = new Uint8Array(6)
  crypto.getRandomValues(buf)
  return Array.from(buf, (b) => SHORT_CODE_CHARS[b % SHORT_CODE_CHARS.length]).join('')
}

export async function createGame(): Promise<{ gameId: string; shortCode: string }> {
  const supabase = createServerClient()

  // Retry on the (astronomically rare) unique-code collision
  for (let attempt = 0; attempt < 5; attempt++) {
    const shortCode = generateShortCode()
    const { data, error } = await supabase
      .from('games')
      .insert({ status: 'lobby', short_code: shortCode })
      .select('id, short_code')
      .single()

    if (!error && data) return { gameId: data.id, shortCode: data.short_code as string }
    if (error?.code !== '23505') throw new Error('ゲームの作成に失敗しました')
    // 23505 = unique violation → retry with new code
  }

  throw new Error('ゲームの作成に失敗しました')
}

/** gameId may be a full UUID *or* a 6-char short code */
export async function joinGame(params: {
  gameId: string
  name: string
  deviceId: string
}): Promise<{ playerId: string; qrCodeId: QrCodeId; gameId: string }> {
  const supabase = createServerClient()
  let resolvedGameId = params.gameId.trim()

  // Resolve short code → UUID
  if (resolvedGameId.length !== 36) {
    const { data: found, error } = await supabase
      .from('games')
      .select('id')
      .eq('short_code', resolvedGameId.toUpperCase())
      .single()
    if (error || !found) throw new Error('ゲームが見つかりません（コードを確認してください）')
    resolvedGameId = found.id
  }

  const { name, deviceId } = params

  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('status')
    .eq('id', resolvedGameId)
    .single()

  if (gameError || !game) throw new Error('ゲームが見つかりません')
  if (game.status !== 'lobby') throw new Error('このゲームはすでに開始されています')

  const { data: existing } = await supabase
    .from('players')
    .select('id, qr_code_id')
    .eq('game_id', resolvedGameId)
    .eq('device_id', deviceId)
    .single()

  if (existing) {
    return { playerId: existing.id, qrCodeId: existing.qr_code_id as QrCodeId, gameId: resolvedGameId }
  }

  const { data: usedSlots } = await supabase
    .from('players')
    .select('qr_code_id')
    .eq('game_id', resolvedGameId)

  const used = new Set((usedSlots ?? []).map((p) => p.qr_code_id))
  const nextSlot = QR_CODE_IDS.find((id) => !used.has(id))

  if (!nextSlot) throw new Error('ゲームが満員です（最大6名）')

  const { data: player, error: insertError } = await supabase
    .from('players')
    .insert({ game_id: resolvedGameId, name, device_id: deviceId, qr_code_id: nextSlot })
    .select('id, qr_code_id')
    .single()

  if (insertError || !player) {
    if (insertError?.code === '23505') throw new Error('スロットが競合しました。もう一度お試しください')
    throw new Error('参加に失敗しました')
  }
  return { playerId: player.id, qrCodeId: player.qr_code_id as QrCodeId, gameId: resolvedGameId }
}

export async function startGame(params: {
  gameId: string
  hitDamage: number
  shootCooldown: number
}): Promise<void> {
  const { gameId, hitDamage, shootCooldown } = params
  const supabase = createServerClient()

  const { error } = await supabase
    .from('games')
    .update({
      status:         'active',
      started_at:     new Date().toISOString(),
      hit_damage:     hitDamage,
      shoot_cooldown: shootCooldown,
    })
    .eq('id', gameId)
    .eq('status', 'lobby')

  if (error) throw new Error('ゲーム開始に失敗しました')
}

interface HitResult {
  newHp: number
  gameOver: boolean
  winnerId?: string
}

export async function registerHit(params: {
  gameId: string
  shooterPlayerId: string
  shooterDeviceId: string
  targetQrCodeId: QrCodeId
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
    if (msg.includes('GAME_NOT_ACTIVE')) throw new Error('ゲームがまだ開始されていません')
    if (msg.includes('SHOOTER_DEAD'))    throw new Error('あなたはすでに倒されています')
    if (msg.includes('SELF_SHOT'))       throw new Error('自分自身は撃てません')
    throw new Error('ヒット登録に失敗しました')
  }

  return {
    newHp:    data.newHp,
    gameOver: data.gameOver,
    winnerId: data.winnerId ?? undefined,
  }
}
