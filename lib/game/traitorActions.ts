'use server'

/**
 * traitorActions — Traitor（スパイ）モード専用 Server Actions
 *
 * セキュリティモデル:
 *  - getMyRole:          device_id で本人確認
 *  - callMeeting:        device_id + meeting_uses でスロット確認
 *  - submitVote:         device_id + is_alive で確認
 *  - resolveMeeting:     device_id + host 確認（期限チェック）
 *  - useSabotage:        device_id + role2 = 'traitor' で確認
 *  - investigatePlayer:  device_id + role2 = 'sheriff' + GPS 近接
 *  - completeMission:    RPC でアトミックに実行
 */

import { createServerClient } from '@/lib/supabase/server'
import { geoDistM } from '@/lib/game/geo'
import { MEETING_DURATION_MS, SABOTAGE_DURATION_MS, INVESTIGATE_RADIUS_M } from '@/lib/game/constants'
import type { PlayerRole2 } from '@/types/database'

/** 自分の role2 を取得（デバイス ID で本人確認） */
export async function getMyRole(params: {
  playerId: string
  deviceId: string
}): Promise<{
  role2:            PlayerRole2
  meeting_uses:     number
  investigate_uses: number
  allTraitorIds:    string[]
}> {
  const { playerId, deviceId } = params
  const supabase = createServerClient()

  const { data: player } = await supabase.from('players')
    .select('role2, meeting_uses, investigate_uses, game_id')
    .eq('id', playerId).eq('device_id', deviceId).single()
  if (!player) throw new Error('プレイヤーが見つかりません')

  let allTraitorIds: string[] = []
  if (player.role2 === 'traitor') {
    const { data: traitors } = await supabase.from('players')
      .select('id').eq('game_id', player.game_id).eq('role2', 'traitor')
    allTraitorIds = traitors?.map(t => t.id) ?? []
  }

  return {
    role2:            player.role2 as PlayerRole2,
    meeting_uses:     player.meeting_uses,
    investigate_uses: player.investigate_uses,
    allTraitorIds,
  }
}

/** 緊急集会を招集する（ゲーム中に誰でも1回呼べる） */
export async function callMeeting(params: {
  gameId:   string
  callerId: string
  deviceId: string
}): Promise<{ meetingId: string }> {
  const { gameId, callerId, deviceId } = params
  const supabase = createServerClient()

  const { data: player } = await supabase.from('players')
    .select('is_alive, meeting_uses')
    .eq('id', callerId).eq('device_id', deviceId).eq('game_id', gameId).single()
  if (!player?.is_alive)       throw new Error('戦闘不能です')
  if (!player.meeting_uses)    throw new Error('集会を招集する権利がありません')

  const { data: game } = await supabase.from('games')
    .select('status, meeting_id').eq('id', gameId).single()
  if (!game || game.status !== 'active') throw new Error('ゲーム中ではありません')
  if (game.meeting_id) throw new Error('すでに集会が進行中です')

  const meetingId    = crypto.randomUUID()
  const meetingUntil = new Date(Date.now() + MEETING_DURATION_MS).toISOString()

  await Promise.all([
    supabase.from('players').update({ meeting_uses: player.meeting_uses - 1 })
      .eq('id', callerId),
    supabase.from('games').update({ meeting_id: meetingId, meeting_until: meetingUntil })
      .eq('id', gameId),
  ])

  return { meetingId }
}

/** 投票を送信し、全員投票済みなら即座に集計する */
export async function submitVote(params: {
  gameId:    string
  voterId:   string
  deviceId:  string
  targetId:  string | null
}): Promise<{
  resolved:   boolean
  voteCount?: number
  total?:     number
  exileId?:   string | null
  exileRole?: PlayerRole2 | null
  gameOver?:  boolean
  winner?:    string | null
}> {
  const { gameId, voterId, deviceId, targetId } = params
  const supabase = createServerClient()

  const { data: game } = await supabase.from('games')
    .select('meeting_id, meeting_until, status').eq('id', gameId).single()
  if (!game?.meeting_id) throw new Error('集会が進行中ではありません')
  const meetingId = game.meeting_id

  const { data: voter } = await supabase.from('players')
    .select('is_alive').eq('id', voterId).eq('device_id', deviceId).eq('game_id', gameId).single()
  if (!voter?.is_alive) throw new Error('戦闘不能です')

  await supabase.from('traitor_votes').upsert(
    { game_id: gameId, meeting_id: meetingId, voter_id: voterId, target_id: targetId },
    { onConflict: 'meeting_id,voter_id' }
  )

  const { count: aliveCount } = await supabase.from('players')
    .select('*', { count: 'exact', head: true })
    .eq('game_id', gameId).eq('is_alive', true)
  const { count: voteCount } = await supabase.from('traitor_votes')
    .select('*', { count: 'exact', head: true })
    .eq('meeting_id', meetingId)

  const total = aliveCount ?? 0
  const voted = voteCount ?? 0
  const timeUp = new Date() >= new Date(game.meeting_until ?? '')

  if (voted < total && !timeUp) {
    return { resolved: false, voteCount: voted, total }
  }

  return resolveMeetingInternal(supabase, gameId, meetingId)
}

/** ホストが時間切れを検知して集計を強制実行する */
export async function resolveMeeting(params: {
  gameId:   string
  hostId:   string
  deviceId: string
}): Promise<{
  resolved:  boolean
  exileId?:  string | null
  exileRole?: PlayerRole2 | null
  gameOver?: boolean
  winner?:   string | null
}> {
  const { gameId, hostId, deviceId } = params
  const supabase = createServerClient()

  const { data: game } = await supabase.from('games')
    .select('meeting_id, meeting_until, status').eq('id', gameId).single()
  if (!game?.meeting_id || game.status !== 'active') return { resolved: false }

  if (new Date() < new Date(game.meeting_until ?? '')) return { resolved: false }

  const { data: player } = await supabase.from('players')
    .select('id').eq('id', hostId).eq('device_id', deviceId).eq('game_id', gameId).single()
  if (!player) throw new Error('認証エラー')

  return resolveMeetingInternal(supabase, gameId, game.meeting_id)
}

async function resolveMeetingInternal(
  supabase:  ReturnType<typeof createServerClient>,
  gameId:    string,
  meetingId: string,
): Promise<{
  resolved:  boolean
  exileId?:  string | null
  exileRole?: PlayerRole2 | null
  gameOver?: boolean
  winner?:   string | null
}> {
  const { data: votes } = await supabase.from('traitor_votes')
    .select('target_id').eq('meeting_id', meetingId).not('target_id', 'is', null)

  let exileId: string | null = null
  if (votes && votes.length > 0) {
    const tally = new Map<string, number>()
    for (const v of votes) {
      if (v.target_id) tally.set(v.target_id, (tally.get(v.target_id) ?? 0) + 1)
    }
    const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1])
    if (sorted.length > 0 && (sorted.length === 1 || sorted[0][1] > sorted[1][1])) {
      exileId = sorted[0][0]
    }
  }

  let exileRole: PlayerRole2 | null = null
  if (exileId) {
    const { data: exiled } = await supabase.from('players')
      .select('role2').eq('id', exileId).single()
    exileRole = (exiled?.role2 ?? null) as PlayerRole2 | null
    await supabase.from('players')
      .update({ is_alive: false, killer_name: '集会で追放' }).eq('id', exileId)
  }

  const { data: closedRows } = await supabase.from('games')
    .update({ meeting_id: null, meeting_until: null })
    .eq('id', gameId).eq('meeting_id', meetingId)
    .select('id')
  if (!closedRows?.length) return { resolved: false }

  const { count: traitorAlive } = await supabase.from('players')
    .select('*', { count: 'exact', head: true })
    .eq('game_id', gameId).eq('is_alive', true).eq('role2', 'traitor')
  const { count: crewAlive } = await supabase.from('players')
    .select('*', { count: 'exact', head: true })
    .eq('game_id', gameId).eq('is_alive', true).neq('role2', 'traitor')

  let gameOver = false
  let winner: string | null = null
  const ta = traitorAlive ?? 0
  const ca = crewAlive ?? 0

  if (ta === 0)       { gameOver = true; winner = 'crew' }
  else if (ta >= ca)  { gameOver = true; winner = 'traitor' }

  if (gameOver) {
    await supabase.from('games')
      .update({ status: 'finished', finished_at: new Date().toISOString(), winner_team: winner })
      .eq('id', gameId)
  }

  return { resolved: true, exileId, exileRole, gameOver, winner }
}

/** Traitor の妨害（Comms Sabotage: 全員のレーダーを20秒間無効化） */
export async function useSabotage(params: {
  gameId:   string
  playerId: string
  deviceId: string
}): Promise<void> {
  const { gameId, playerId, deviceId } = params
  const supabase = createServerClient()

  const { data: player } = await supabase.from('players')
    .select('role2, is_alive').eq('id', playerId).eq('device_id', deviceId).single()
  if (!player?.is_alive)         throw new Error('戦闘不能です')
  if (player.role2 !== 'traitor') throw new Error('Traitor 専用能力です')

  const { data: game } = await supabase.from('games')
    .select('status, sabotage_until').eq('id', gameId).single()
  if (game?.status !== 'active') throw new Error('ゲーム中ではありません')
  if (game.sabotage_until && new Date() < new Date(game.sabotage_until)) {
    throw new Error('妨害はまだクールダウン中です')
  }

  const until = new Date(Date.now() + SABOTAGE_DURATION_MS).toISOString()
  await supabase.from('games')
    .update({ sabotage_type: 'comms', sabotage_until: until }).eq('id', gameId)
}

/** Sheriff の調査（対象の role2 を確認する） */
export async function investigatePlayer(params: {
  gameId:    string
  sheriffId: string
  deviceId:  string
  targetId:  string
}): Promise<{ role2: PlayerRole2 }> {
  const { gameId, sheriffId, deviceId, targetId } = params
  const supabase = createServerClient()

  const { data: sheriff } = await supabase.from('players')
    .select('role2, is_alive, investigate_uses, lat, lng')
    .eq('id', sheriffId).eq('device_id', deviceId).eq('game_id', gameId).single()
  if (!sheriff?.is_alive)              throw new Error('戦闘不能です')
  if (sheriff.role2 !== 'sheriff')     throw new Error('Sheriff 専用能力です')
  if (!sheriff.investigate_uses)       throw new Error('調査回数を使い切りました')

  const { data: target } = await supabase.from('players')
    .select('role2, is_alive, lat, lng').eq('id', targetId).eq('game_id', gameId).single()
  if (!target?.is_alive) throw new Error('対象は戦闘不能です')

  if (sheriff.lat != null && target.lat != null) {
    const dist = geoDistM(
      sheriff as { lat: number; lng: number },
      target  as { lat: number; lng: number },
    )
    if (dist > INVESTIGATE_RADIUS_M) throw new Error(`対象が遠すぎます（${Math.round(dist)}m）`)
  }

  await supabase.from('players')
    .update({ investigate_uses: sheriff.investigate_uses - 1 }).eq('id', sheriffId)

  return { role2: target.role2 as PlayerRole2 }
}

/**
 * タスク完了 — complete_mission RPC をアトミックに呼び出す。
 * JS 側で SELECT → UPDATE すると Lost Update が起きるため RPC に委譲する。
 */
export async function completeMission(params: {
  objectiveId: string
  playerId:    string
  deviceId:    string
  gameId:      string
}): Promise<{ taskDone: number; taskGoal: number; crewWins: boolean }> {
  const { objectiveId, playerId, deviceId, gameId } = params
  const supabase = createServerClient()

  const { data, error } = await supabase.rpc('complete_mission', {
    p_objective_id: objectiveId,
    p_player_id:    playerId,
    p_device_id:    deviceId,
    p_game_id:      gameId,
  })
  if (error) throw new Error(error.message)

  return {
    taskDone:  (data as { taskDone: number; taskGoal: number; crewWins: boolean }).taskDone,
    taskGoal:  (data as { taskDone: number; taskGoal: number; crewWins: boolean }).taskGoal,
    crewWins:  (data as { taskDone: number; taskGoal: number; crewWins: boolean }).crewWins,
  }
}
