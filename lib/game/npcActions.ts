'use server'

/**
 * npcActions — ハンティング（hunting）モード専用 Server Actions
 *
 * セキュリティモデル:
 *  - 移動系（moveNPC / updateLockon / armLunge / fireLunge / cancelLunge）は
 *    controller_id + device_id で認証されたクライアントのみ実行可能
 *  - attackNPC はプレイヤー自身の device_id 認証 + サーバー側で距離・角度を再検証
 */

import { createServerClient } from '@/lib/supabase/server'
import {
  HUNTING_BACKSTAB_RANGE_M, HUNTING_BACKSTAB_ANGLE,
  HUNTING_BACKSTAB_DAMAGE, HUNTING_STUN_SEC, HUNTING_CONFUSED_SEC,
  HUNTING_ATTACK_COOLDOWN_MS, HUNTING_CONTROLLER_TTL_MS, HUNTING_LUNGE_WARN_SEC,
  HUNTING_OFFLINE_THRESHOLD_MS, huntingNPCStats,
} from '@/lib/game/constants'
import { geoDistM, bearingDeg, normAngle } from '@/lib/game/geo'

// ─────────────────────────────────────────────────────────────────────────────
// 初期化
// ─────────────────────────────────────────────────────────────────────────────

/** ゲーム開始時に NPC を生成する（startGame から呼ぶ） */
export async function initNPC(params: {
  gameId:      string
  lat:         number
  lng:         number
  playerCount: number
}): Promise<void> {
  const { gameId, lat, lng, playerCount } = params
  const stats = huntingNPCStats(playerCount)
  const supabase = createServerClient()

  await supabase.from('game_npcs').upsert({
    game_id:         gameId,
    hp:              stats.hp,
    max_hp:          stats.hp,
    lat,
    lng,
    heading:         0,
    speed_mps:       stats.speedMps,
    lockon_seconds:  stats.lockonSeconds,
    lunge_interval_s: stats.lungeIntervalS,
  }, { onConflict: 'game_id' })
}

// ─────────────────────────────────────────────────────────────────────────────
// コントローラー管理
// ─────────────────────────────────────────────────────────────────────────────

/**
 * NPC コントローラーを要求する（heartbeat TTL 切れ / 未割当時のみ成功）。
 * 成功した場合 true を返す。
 */
export async function claimController(params: {
  gameId:    string
  playerId:  string
  deviceId:  string
}): Promise<{ claimed: boolean }> {
  const { gameId, playerId, deviceId } = params
  const supabase = createServerClient()

  // デバイス認証
  const { data: player } = await supabase
    .from('players').select('id').eq('id', playerId).eq('device_id', deviceId).single()
  if (!player) return { claimed: false }

  const ttlExpiry = new Date(Date.now() - HUNTING_CONTROLLER_TTL_MS).toISOString()

  // controller_heartbeat が null か TTL 切れの場合のみ上書き
  const { data } = await supabase
    .from('game_npcs')
    .update({ controller_id: playerId, controller_heartbeat: new Date().toISOString() })
    .eq('game_id', gameId)
    .or(`controller_heartbeat.is.null,controller_heartbeat.lt.${ttlExpiry}`)
    .select('id')

  return { claimed: (data?.length ?? 0) > 0 }
}

/** コントローラー heartbeat を更新する（2秒ごとに呼ぶ） */
export async function heartbeat(params: {
  gameId:      string
  controllerId: string
}): Promise<void> {
  const { gameId, controllerId } = params
  const supabase = createServerClient()
  await supabase.from('game_npcs')
    .update({ controller_heartbeat: new Date().toISOString() })
    .eq('game_id', gameId)
    .eq('controller_id', controllerId)
}

// ─────────────────────────────────────────────────────────────────────────────
// 移動・ロックオン（コントローラー専用）
// ─────────────────────────────────────────────────────────────────────────────

/** NPC の位置・向き・ロックオン状態をまとめて更新する */
export async function moveNPC(params: {
  gameId:           string
  controllerId:     string
  newLat:           number
  newLng:           number
  heading:          number
  lockonTargetId?:  string | null
  lockonStartAt?:   string | null
}): Promise<void> {
  const { gameId, controllerId, newLat, newLng, heading, lockonTargetId, lockonStartAt } = params
  const supabase = createServerClient()

  await supabase.from('game_npcs').update({
    lat:                newLat,
    lng:                newLng,
    heading,
    controller_heartbeat: new Date().toISOString(),
    ...(lockonTargetId  !== undefined && { lockon_target_id:  lockonTargetId }),
    ...(lockonStartAt   !== undefined && { lockon_start_at:   lockonStartAt }),
  }).eq('game_id', gameId).eq('controller_id', controllerId)
}

/** ロックオン解除 + 混乱（見失い）状態をセット */
export async function clearLockon(params: {
  gameId:       string
  controllerId: string
}): Promise<void> {
  const { gameId, controllerId } = params
  const supabase = createServerClient()
  const confusedUntil = new Date(Date.now() + HUNTING_CONFUSED_SEC * 1000).toISOString()

  await supabase.from('game_npcs').update({
    lockon_target_id: null,
    lockon_start_at:  null,
    confused_until:   confusedUntil,
  }).eq('game_id', gameId).eq('controller_id', controllerId)
}

// ─────────────────────────────────────────────────────────────────────────────
// ランジ（コントローラー専用）
// ─────────────────────────────────────────────────────────────────────────────

/** ランジ予告をセット（controller 側で 30s 経過を確認してから呼ぶ） */
export async function armLunge(params: {
  gameId:       string
  controllerId: string
}): Promise<void> {
  const { gameId, controllerId } = params
  const supabase = createServerClient()
  const now     = Date.now()
  const fireAt  = new Date(now + HUNTING_LUNGE_WARN_SEC * 1000).toISOString()

  await supabase.from('game_npcs').update({
    lunge_armed_at: new Date(now).toISOString(),
    lunge_fire_at:  fireAt,
  }).eq('game_id', gameId).eq('controller_id', controllerId)
}

/** ランジ予告をキャンセル（スタン時など） */
export async function cancelLunge(params: {
  gameId:       string
  controllerId: string
}): Promise<void> {
  const { gameId, controllerId } = params
  const supabase = createServerClient()
  await supabase.from('game_npcs').update({
    lunge_armed_at: null,
    lunge_fire_at:  null,
  }).eq('game_id', gameId).eq('controller_id', controllerId)
}

/**
 * ランジ発動 — 半径内の生存プレイヤーを全員捕食する。
 * 全滅なら NPC 勝利でゲーム終了。
 */
export async function fireLunge(params: {
  gameId:       string
  controllerId: string
  npcId:        string
}): Promise<{ gameOver: boolean }> {
  const { gameId, controllerId, npcId } = params
  const supabase = createServerClient()

  // NPC 位置・ランジ半径を取得
  const { data: npc } = await supabase
    .from('game_npcs').select('lat,lng,lunge_radius_m,lunge_fire_at')
    .eq('id', npcId).single()
  if (!npc?.lat || !npc?.lng) return { gameOver: false }

  // まだ発動時刻になっていなければスキップ
  if (npc.lunge_fire_at && new Date(npc.lunge_fire_at).getTime() > Date.now()) {
    return { gameOver: false }
  }

  // ランジ状態をクリア
  await supabase.from('game_npcs').update({
    lunge_armed_at: null,
    lunge_fire_at:  null,
    last_lunge_at:  new Date().toISOString(),
  }).eq('id', npcId).eq('controller_id', controllerId)

  // 半径内の生存プレイヤーを取得
  const { data: players } = await supabase
    .from('players').select('id, lat, lng').eq('game_id', gameId).eq('is_alive', true)
  if (!players?.length) return { gameOver: false }

  const victims = players.filter(p => {
    if (p.lat == null || p.lng == null) return false
    return geoDistM({ lat: npc.lat!, lng: npc.lng! }, { lat: p.lat, lng: p.lng }) <= npc.lunge_radius_m
  })

  for (const v of victims) {
    await supabase.from('players').update({ is_alive: false, hp: 0, killer_name: '鬼' })
      .eq('id', v.id)
  }

  // 全滅チェック
  const { data: alive } = await supabase
    .from('players').select('id').eq('game_id', gameId).eq('is_alive', true)
  if (!alive?.length) {
    await supabase.from('games').update({
      status: 'finished', finished_at: new Date().toISOString(), winner_team: 'npc',
    }).eq('id', gameId)
    return { gameOver: true }
  }

  return { gameOver: false }
}

// ─────────────────────────────────────────────────────────────────────────────
// ロックオン捕食（コントローラー専用）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ロックオン 2 秒経過後の捕食。
 * サーバー側で lockon_target_id と距離を再検証する。
 */
export async function npcCatch(params: {
  gameId:       string
  controllerId: string
  npcId:        string
  targetId:     string
}): Promise<{ gameOver: boolean }> {
  const { gameId, controllerId, npcId, targetId } = params
  const supabase = createServerClient()

  // NPC・ターゲット取得
  const [{ data: npc }, { data: target }] = await Promise.all([
    supabase.from('game_npcs').select('lat,lng,catch_range_m,lockon_target_id').eq('id', npcId).single(),
    supabase.from('players').select('lat,lng,is_alive').eq('id', targetId).eq('game_id', gameId).single(),
  ])

  if (!npc || !target?.is_alive) return { gameOver: false }
  if (npc.lockon_target_id !== targetId) return { gameOver: false }  // 既に解除済み

  // 距離再検証（GPS は TTL チェック済みのはず）
  if (npc.lat == null || npc.lng == null || target.lat == null || target.lng == null) {
    return { gameOver: false }
  }
  const dist = geoDistM(
    { lat: npc.lat, lng: npc.lng },
    { lat: target.lat, lng: target.lng },
  )
  if (dist > npc.catch_range_m * 1.5) return { gameOver: false }  // 1.5倍の余裕（GPS誤差吸収）

  // 捕食実行
  await supabase.from('players').update({ is_alive: false, hp: 0, killer_name: '鬼' })
    .eq('id', targetId)

  // ロックオンクリア
  await supabase.from('game_npcs').update({
    lockon_target_id: null, lockon_start_at: null,
  }).eq('id', npcId).eq('controller_id', controllerId)

  // 全滅チェック
  const { data: alive } = await supabase
    .from('players').select('id').eq('game_id', gameId).eq('is_alive', true)
  if (!alive?.length) {
    await supabase.from('games').update({
      status: 'finished', finished_at: new Date().toISOString(), winner_team: 'npc',
    }).eq('id', gameId)
    return { gameOver: true }
  }

  return { gameOver: false }
}

// ─────────────────────────────────────────────────────────────────────────────
// 背後攻撃（プレイヤー専用）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * NPC への背後攻撃。
 * 距離・角度・クールダウン・スタン中でないことをサーバー側で再検証する。
 */
export async function attackNPC(params: {
  gameId:   string
  playerId: string
  deviceId: string
  npcId:    string
}): Promise<{ newHp: number; stunned: boolean; gameOver: boolean }> {
  const { gameId, playerId, deviceId, npcId } = params
  const supabase = createServerClient()

  // プレイヤー認証
  const { data: player } = await supabase
    .from('players')
    .select('id,lat,lng,is_alive,npc_attack_last_at,last_seen')
    .eq('id', playerId).eq('device_id', deviceId).eq('game_id', gameId).single()

  if (!player?.is_alive) throw new Error('戦闘不能です')

  // GPS 鮮度チェック（30秒以上古ければ拒否）
  if (player.last_seen) {
    const age = Date.now() - new Date(player.last_seen).getTime()
    if (age > HUNTING_OFFLINE_THRESHOLD_MS) throw new Error('GPS情報が古すぎます')
  }

  // クールダウンチェック
  if (player.npc_attack_last_at) {
    const cd = Date.now() - new Date(player.npc_attack_last_at).getTime()
    if (cd < HUNTING_ATTACK_COOLDOWN_MS) {
      throw new Error(`クールダウン中 (あと ${Math.ceil((HUNTING_ATTACK_COOLDOWN_MS - cd) / 1000)}秒)`)
    }
  }

  // NPC 取得
  const { data: npc } = await supabase
    .from('game_npcs')
    .select('id,lat,lng,heading,hp,stun_until,lunge_armed_at,lunge_fire_at,controller_id')
    .eq('id', npcId).eq('game_id', gameId).single()

  if (!npc) throw new Error('NPCが見つかりません')
  if (!npc.lat || !npc.lng) throw new Error('NPC位置不明')

  // 距離チェック
  if (!player.lat || !player.lng) throw new Error('自分の位置不明')
  const dist = geoDistM(
    { lat: player.lat, lng: player.lng },
    { lat: npc.lat,    lng: npc.lng    },
  )
  if (dist > HUNTING_BACKSTAB_RANGE_M) throw new Error('距離が離れすぎています')

  // 背後角度チェック
  const bearing    = bearingDeg({ lat: npc.lat, lng: npc.lng }, { lat: player.lat, lng: player.lng })
  const rearBearing = (npc.heading + 180) % 360
  const angleDiff  = Math.abs(normAngle(bearing - rearBearing))
  if (angleDiff > HUNTING_BACKSTAB_ANGLE) throw new Error('背後ではありません')

  // ダメージ計算
  const newHp = Math.max(0, npc.hp - HUNTING_BACKSTAB_DAMAGE)
  const now   = new Date()
  const stunUntil = new Date(now.getTime() + HUNTING_STUN_SEC * 1000).toISOString()
  const gameOver  = newHp === 0

  // NPC 更新（スタン + ダメージ + ロックオン解除 + ランジキャンセル）
  await supabase.from('game_npcs').update({
    hp:               newHp,
    stun_until:       gameOver ? null : stunUntil,
    confused_until:   gameOver ? null : stunUntil,
    lockon_target_id: null,
    lockon_start_at:  null,
    lunge_armed_at:   null,
    lunge_fire_at:    null,
  }).eq('id', npcId)

  // プレイヤーのクールダウン更新
  await supabase.from('players').update({ npc_attack_last_at: now.toISOString() })
    .eq('id', playerId)

  // NPC 討伐 → プレイヤー勝利
  if (gameOver) {
    await supabase.from('games').update({
      status: 'finished', finished_at: now.toISOString(), winner_team: 'player',
    }).eq('id', gameId)
  }

  return { newHp, stunned: !gameOver, gameOver }
}

// ─────────────────────────────────────────────────────────────────────────────
// 封印スキャン勝利チェック（claimObjective から呼ばれる内部拡張）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 封印QR をスキャン後、全封印が完了していれば Players 勝利でゲーム終了。
 * ObjectiveAlert 側の completeMission / claimObjective 完了後に呼び出す。
 */
export async function checkSealVictory(params: {
  gameId: string
}): Promise<{ allSealed: boolean }> {
  const { gameId } = params
  const supabase = createServerClient()

  const { data: seals } = await supabase
    .from('game_objectives')
    .select('id,is_claimed').eq('game_id', gameId).eq('type', 'seal')

  if (!seals?.length) return { allSealed: false }

  const allSealed = seals.every(s => s.is_claimed)
  if (allSealed) {
    await supabase.from('games').update({
      status: 'finished', finished_at: new Date().toISOString(), winner_team: 'player',
    }).eq('id', gameId)
  }

  return { allSealed }
}
