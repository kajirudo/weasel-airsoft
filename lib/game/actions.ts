'use server'

import { createServerClient } from '@/lib/supabase/server'
import { QR_CODE_IDS } from '@/lib/game/constants'
import type { QrCodeId } from '@/types/database'

export async function createGame(): Promise<{ gameId: string }> {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('games')
    .insert({ status: 'lobby' })
    .select('id')
    .single()

  if (error || !data) throw new Error('ゲームの作成に失敗しました')
  return { gameId: data.id }
}

export async function joinGame(params: {
  gameId: string
  name: string
  deviceId: string
}): Promise<{ playerId: string; qrCodeId: QrCodeId }> {
  const { gameId, name, deviceId } = params
  const supabase = createServerClient()

  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('status')
    .eq('id', gameId)
    .single()

  if (gameError || !game) throw new Error('ゲームが見つかりません')
  if (game.status !== 'lobby') throw new Error('このゲームはすでに開始されています')

  const { data: existing } = await supabase
    .from('players')
    .select('id, qr_code_id')
    .eq('game_id', gameId)
    .eq('device_id', deviceId)
    .single()

  if (existing) {
    return { playerId: existing.id, qrCodeId: existing.qr_code_id as QrCodeId }
  }

  const { data: usedSlots } = await supabase
    .from('players')
    .select('qr_code_id')
    .eq('game_id', gameId)

  const used = new Set((usedSlots ?? []).map((p) => p.qr_code_id))
  const nextSlot = QR_CODE_IDS.find((id) => !used.has(id))

  if (!nextSlot) throw new Error('ゲームが満員です（最大5名）')

  const { data: player, error: insertError } = await supabase
    .from('players')
    .insert({ game_id: gameId, name, device_id: deviceId, qr_code_id: nextSlot })
    .select('id, qr_code_id')
    .single()

  if (insertError || !player) {
    if (insertError?.code === '23505') throw new Error('スロットが競合しました。もう一度お試しください')
    throw new Error('参加に失敗しました')
  }
  return { playerId: player.id, qrCodeId: player.qr_code_id as QrCodeId }
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

  // hit_damage は DB 側の register_hit RPC が games.hit_damage から読む
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
