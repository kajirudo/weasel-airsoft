'use server'

import { createServerClient } from '@/lib/supabase/server'
import { QR_CODE_IDS, SCORE_SECS_PER_POINT } from '@/lib/game/constants'
import type { QrCodeId, MarkerMode, GameMode } from '@/types/database'

// ─── GPS ユーティリティ（サーバー側でオブジェクト散布に使用） ──────────────────

function geoDistM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dlat = (a.lat - b.lat) * 111_320
  const dlng = (a.lng - b.lng) * 111_320 * Math.cos(a.lat * Math.PI / 180)
  return Math.sqrt(dlat ** 2 + dlng ** 2)
}

function randomGeo(lat: number, lng: number, maxR: number) {
  const angle      = Math.random() * 2 * Math.PI
  const r          = maxR * Math.sqrt(Math.random())
  const mPerDegLat = 111_320
  const mPerDegLng = 111_320 * Math.cos(lat * Math.PI / 180)
  return { lat: lat + (r * Math.cos(angle)) / mPerDegLat, lng: lng + (r * Math.sin(angle)) / mPerDegLng }
}

/** minDistM 以上の間隔を保って count 個の GPS 点を散布する */
function scatterPoints(
  centerLat: number, centerLng: number,
  count: number, radiusM: number, minDistM: number,
): Array<{ lat: number; lng: number }> {
  const pts: Array<{ lat: number; lng: number }> = []
  let tries = 0
  while (pts.length < count && tries < count * 30) {
    tries++
    const p = randomGeo(centerLat, centerLng, radiusM)
    if (pts.every(q => geoDistM(q, p) >= minDistM)) pts.push(p)
  }
  return pts
}

// ─── Short code generator ──────────────────────────────────────────────────────
const SHORT_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateShortCode(): string {
  const buf = new Uint8Array(6)
  crypto.getRandomValues(buf)
  return Array.from(buf, (b) => SHORT_CODE_CHARS[b % SHORT_CODE_CHARS.length]).join('')
}

export async function createGame(params?: {
  markerMode?: MarkerMode
}): Promise<{ gameId: string; shortCode: string }> {
  const supabase   = createServerClient()
  const markerMode = params?.markerMode ?? 'qr'

  for (let attempt = 0; attempt < 5; attempt++) {
    const shortCode = generateShortCode()
    const { data, error } = await supabase
      .from('games')
      .insert({ status: 'lobby', short_code: shortCode, marker_mode: markerMode })
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
  gameId:           string
  hitDamage:        number
  shootCooldown:    number
  durationMinutes:  number
  teamMode:         boolean
  markerMode:       MarkerMode
  gameMode:         GameMode
  /** ホストの GPS 座標（フィールド中心 + ストーム中心）*/
  fieldCenterLat?:  number
  fieldCenterLng?:  number
  /** オブジェクト散布半径（m） */
  fieldRadiusM?:    number
  /** ストーム初期安全圏半径（m） */
  stormRadiusM?:    number
  /** ストーム最終安全圏半径（m） */
  stormFinalM?:     number
}): Promise<void> {
  const {
    gameId, hitDamage, shootCooldown, durationMinutes,
    teamMode, markerMode, gameMode,
    fieldCenterLat, fieldCenterLng,
    fieldRadiusM = 70, stormRadiusM = 80, stormFinalM = 15,
  } = params
  const supabase  = createServerClient()
  const startedAt = new Date().toISOString()

  // ── チーム自動割り当て ──────────────────────────────────────────────────
  if (teamMode) {
    await supabase.from('players').update({ team: 'red' })
      .eq('game_id', gameId).in('qr_code_id', ['player_1', 'player_3', 'player_5'])
    await supabase.from('players').update({ team: 'blue' })
      .eq('game_id', gameId).in('qr_code_id', ['player_2', 'player_4', 'player_6'])
  }

  // ── サバイバルモード: Hunter をランダム選出 ─────────────────────────────
  if (gameMode === 'survival') {
    const { data: allPlayers } = await supabase
      .from('players').select('id').eq('game_id', gameId)
    if (allPlayers && allPlayers.length > 0) {
      const hunterIdx = Math.floor(Math.random() * allPlayers.length)
      const hunterId  = allPlayers[hunterIdx].id
      await supabase.from('players').update({ role: 'hunter', hp: 200 })
        .eq('id', hunterId)
    }
  }

  // ── ゲームレコード更新 ─────────────────────────────────────────────────
  const { error } = await supabase.from('games').update({
    status:           'active',
    started_at:       startedAt,
    hit_damage:       hitDamage,
    shoot_cooldown:   shootCooldown,
    duration_minutes: durationMinutes,
    team_mode:        teamMode,
    marker_mode:      markerMode,
    game_mode:        gameMode,
    storm_center_lat: fieldCenterLat ?? null,
    storm_center_lng: fieldCenterLng ?? null,
    storm_radius_m:   stormRadiusM,   // 初期安全圏（fieldRadiusM とは別）
    storm_final_m:    stormFinalM,
  }).eq('id', gameId).eq('status', 'lobby')
  if (error) throw new Error('ゲーム開始に失敗しました')

  // ── GPS 座標がある場合のみオブジェクト生成 ─────────────────────────────
  if (fieldCenterLat != null && fieldCenterLng != null) {
    const { data: players } = await supabase
      .from('players').select('id, role').eq('game_id', gameId)
    const playerCount  = players?.length ?? 2
    const survivorCount = players?.filter(p => p.role !== 'hunter').length ?? playerCount
    await generateObjectivesInternal(supabase, {
      gameId, centerLat: fieldCenterLat, centerLng: fieldCenterLng,
      radiusM: fieldRadiusM, gameMode, playerCount, survivorCount,
    })
  }
}

/** オブジェクトをフィールドにランダム散布する（startGame 内から呼ぶ内部関数） */
async function generateObjectivesInternal(
  supabase: ReturnType<typeof createServerClient>,
  params: {
    gameId:        string
    centerLat:     number
    centerLng:     number
    radiusM:       number
    gameMode:      GameMode
    playerCount:   number
    survivorCount: number
  },
) {
  const { gameId, centerLat, centerLng, radiusM, gameMode, playerCount, survivorCount } = params

  type ObjInsert = { game_id: string; lat: number; lng: number; type: string }
  const inserts: ObjInsert[] = []

  // タイプ別の個数を決定
  const counts = gameMode === 'survival'
    ? { generator: survivorCount + 1, medkit: Math.max(1, survivorCount - 1), damage_boost: 2, control_point: 0 }
    : gameMode === 'tactics'
    ? { generator: 0, medkit: 2, damage_boost: 2, control_point: 3 }
    : /* battle */
    { generator: 0, medkit: Math.max(1, playerCount - 1), damage_boost: 2, control_point: 0 }

  const totalCount = Object.values(counts).reduce((a, b) => a + b, 0)
  const points = scatterPoints(centerLat, centerLng, totalCount, radiusM, 20)

  let idx = 0
  for (const [type, count] of Object.entries(counts)) {
    for (let i = 0; i < count && idx < points.length; i++, idx++) {
      inserts.push({ game_id: gameId, lat: points[idx].lat, lng: points[idx].lng, type })
    }
  }

  if (inserts.length > 0) {
    await supabase.from('game_objectives').insert(inserts)
  }
}

export async function createRematch(params: {
  prevGameId: string
}): Promise<{ gameId: string; shortCode: string }> {
  const supabase = createServerClient()

  // 前ゲームの marker_mode を引き継ぐ
  const { data: prevGame } = await supabase
    .from('games').select('marker_mode').eq('id', params.prevGameId).single()
  const markerMode = (prevGame?.marker_mode ?? 'qr') as MarkerMode

  const { gameId, shortCode } = await createGame({ markerMode })
  await supabase.from('games').update({ next_game_id: gameId }).eq('id', params.prevGameId)
  return { gameId, shortCode }
}

export async function quickMatch(params: {
  name:        string
  deviceId:    string
  markerMode?: MarkerMode
}): Promise<{ playerId: string; qrCodeId: QrCodeId; gameId: string }> {
  const supabase = createServerClient()
  const { name, deviceId, markerMode = 'qr' } = params
  const { data: candidates } = await supabase
    .from('games').select('id').eq('status', 'lobby')
    .order('created_at', { ascending: false }).limit(5)
  for (const game of candidates ?? []) {
    try { return await joinGame({ gameId: game.id, name, deviceId }) } catch { continue }
  }
  const { gameId: newGameId } = await createGame({ markerMode })
  return await joinGame({ gameId: newGameId, name, deviceId })
}

/**
 * プレイヤー自身の GPS 位置を更新する。
 * device_id による本人確認あり（不正な playerId では更新されない）。
 */
export async function updatePosition(params: {
  playerId: string
  deviceId: string
  lat:      number
  lng:      number
  heading:  number
}): Promise<void> {
  const { playerId, deviceId, lat, lng, heading } = params
  const supabase = createServerClient()
  await supabase
    .from('players')
    .update({ lat, lng, heading })
    .eq('id', playerId)
    .eq('device_id', deviceId)  // 自分の行のみ更新
}

// ═══════════════════════════════════════════════════════════════════════════════
// オブジェクト操作 Server Actions
// ═══════════════════════════════════════════════════════════════════════════════

/** アイテム（medkit / damage_boost）を獲得する */
export async function claimObjective(params: {
  objectiveId: string
  playerId:    string
  deviceId:    string
  gameId:      string
}): Promise<{ effect: 'medkit' | 'damage_boost'; newHp?: number }> {
  const { objectiveId, playerId, deviceId, gameId } = params
  const supabase = createServerClient()

  // 本人確認
  const { data: player } = await supabase.from('players')
    .select('id, hp, is_alive').eq('id', playerId).eq('device_id', deviceId).single()
  if (!player?.is_alive) throw new Error('プレイヤーが存在しないか戦闘不能です')

  // オブジェクト取得・検証
  const { data: obj } = await supabase.from('game_objectives')
    .select('*').eq('id', objectiveId).eq('game_id', gameId).single()
  if (!obj) throw new Error('オブジェクトが見つかりません')
  if (obj.is_claimed) throw new Error('すでに獲得済みです')
  if (obj.type !== 'medkit' && obj.type !== 'damage_boost') throw new Error('獲得できないオブジェクトです')

  await supabase.from('game_objectives')
    .update({ is_claimed: true, claimed_by: playerId }).eq('id', objectiveId)

  if (obj.type === 'medkit') {
    const newHp = Math.min(100, player.hp + 40)
    await supabase.from('players').update({ hp: newHp }).eq('id', playerId)
    return { effect: 'medkit', newHp }
  } else {
    await supabase.from('players').update({ damage_boost: true }).eq('id', playerId)
    return { effect: 'damage_boost' }
  }
}

/** 発電機の起動プロセスを開始する（10 秒後に completeGenerator を呼ぶ） */
export async function beginGenerator(params: {
  objectiveId: string
  playerId:    string
  deviceId:    string
  gameId:      string
}): Promise<void> {
  const { objectiveId, playerId, deviceId, gameId } = params
  const supabase = createServerClient()

  const { data: player } = await supabase.from('players')
    .select('id, is_alive').eq('id', playerId).eq('device_id', deviceId).single()
  if (!player?.is_alive) throw new Error('戦闘不能です')

  const { data: obj } = await supabase.from('game_objectives')
    .select('type, is_activated').eq('id', objectiveId).eq('game_id', gameId).single()
  if (!obj || obj.type !== 'generator') throw new Error('発電機ではありません')
  if (obj.is_activated) throw new Error('すでに起動済みです')

  await supabase.from('game_objectives')
    .update({ activate_start: new Date().toISOString(), activating_by: playerId })
    .eq('id', objectiveId)
}

/** 発電機起動を完了する（サーバー側で 10 秒経過を検証） */
export async function completeGenerator(params: {
  objectiveId: string
  playerId:    string
  deviceId:    string
  gameId:      string
}): Promise<{ allActivated: boolean }> {
  const { objectiveId, playerId, deviceId, gameId } = params
  const supabase = createServerClient()

  const { data: obj } = await supabase.from('game_objectives')
    .select('*').eq('id', objectiveId).eq('game_id', gameId).single()
  if (!obj || obj.type !== 'generator') throw new Error('発電機ではありません')
  if (obj.is_activated) return { allActivated: false }
  if (obj.activating_by !== playerId) throw new Error('他のプレイヤーが起動中です')
  if (!obj.activate_start) throw new Error('起動が開始されていません')

  const elapsedMs = Date.now() - new Date(obj.activate_start).getTime()
  if (elapsedMs < 9_500) throw new Error('まだ 10 秒経っていません')   // 500ms の誤差を許容

  // is_activated=false を条件に加えて競合防止（2人同時完了で2重実行しない）
  const { data: updated } = await supabase.from('game_objectives')
    .update({ is_activated: true, activate_start: null, activating_by: null })
    .eq('id', objectiveId).eq('is_activated', false)
    .select('id')
  if (!updated || updated.length === 0) return { allActivated: false }  // すでに別クライアントが完了済み

  // 全発電機起動チェック → Survivor 勝利判定
  const { data: remaining } = await supabase.from('game_objectives')
    .select('id').eq('game_id', gameId).eq('type', 'generator').eq('is_activated', false)
  const allActivated = (remaining?.length ?? 1) === 0

  if (allActivated) {
    await supabase.from('games').update({
      status: 'finished', finished_at: new Date().toISOString(), winner_team: 'survivor',
    }).eq('id', gameId)
  }

  return { allActivated }
}

/** 発電機の起動プロセスをキャンセルする（圏外に出たとき） */
export async function cancelGenerator(params: {
  objectiveId: string; playerId: string; gameId: string
}): Promise<void> {
  const { objectiveId, playerId, gameId } = params
  const supabase = createServerClient()
  await supabase.from('game_objectives')
    .update({ activate_start: null, activating_by: null })
    .eq('id', objectiveId).eq('game_id', gameId).eq('activating_by', playerId)
}

/** 拠点の占領プロセスを開始する（5 秒後に completeCapture を呼ぶ） */
export async function beginCapture(params: {
  objectiveId:   string
  playerId:      string
  deviceId:      string
  gameId:        string
  capturingTeam: 'red' | 'blue'
}): Promise<void> {
  const { objectiveId, playerId, deviceId, gameId, capturingTeam } = params
  const supabase = createServerClient()

  const { data: player } = await supabase.from('players')
    .select('is_alive, team').eq('id', playerId).eq('device_id', deviceId).single()
  if (!player?.is_alive) throw new Error('戦闘不能です')
  if (player.team !== capturingTeam) throw new Error('チームが一致しません')

  await supabase.from('game_objectives')
    .update({ capture_start: new Date().toISOString(), capturing_team: capturingTeam })
    .eq('id', objectiveId).eq('game_id', gameId)
}

/** 拠点占領を完了する（サーバー側で 5 秒経過 + 人数ボーナスを検証） */
export async function completeCapture(params: {
  objectiveId:   string
  playerId:      string
  deviceId:      string
  gameId:        string
  capturingTeam: 'red' | 'blue'
}): Promise<void> {
  const { objectiveId, playerId, deviceId, gameId, capturingTeam } = params
  const supabase = createServerClient()

  const { data: player } = await supabase.from('players')
    .select('is_alive, team, lat, lng').eq('id', playerId).eq('device_id', deviceId).single()
  if (!player?.is_alive) throw new Error('戦闘不能です')

  const { data: obj } = await supabase.from('game_objectives')
    .select('*').eq('id', objectiveId).eq('game_id', gameId).single()
  if (!obj || obj.type !== 'control_point') throw new Error('拠点ではありません')
  if (obj.capturing_team !== capturingTeam) throw new Error('占領チームが一致しません')
  if (!obj.capture_start) throw new Error('占領が開始されていません')

  // ── 人数ボーナス: 同チームの生存プレイヤーが CAPTURE_RADIUS_M 内に何人いるか確認 ──
  // GPS 位置がある場合のみ適用（ない場合は 1 人扱い）
  let teamCount = 1
  if (player.lat != null && player.lng != null) {
    const { data: allies } = await supabase.from('players')
      .select('lat, lng')
      .eq('game_id', gameId).eq('team', capturingTeam).eq('is_alive', true)
    if (allies) {
      const mPerDegLat = 111_320
      const mPerDegLng = 111_320 * Math.cos(player.lat * Math.PI / 180)
      teamCount = allies.filter(a => {
        if (a.lat == null || a.lng == null) return false
        const d = Math.sqrt(
          ((a.lat - obj.lat) * mPerDegLat) ** 2 +
          ((a.lng - obj.lng) * mPerDegLng) ** 2,
        )
        return d <= 10   // CAPTURE_RADIUS_M
      }).length
      teamCount = Math.max(1, teamCount)
    }
  }
  // 2人以上で 2×、3人以上でも最大 2×（テンポを壊さない程度に）
  const speedMultiplier = Math.min(teamCount, 2)
  const requiredMs      = Math.ceil(4_500 / speedMultiplier)

  const elapsedMs = Date.now() - new Date(obj.capture_start).getTime()
  if (elapsedMs < requiredMs) throw new Error('まだ占領時間が足りません')

  // 前チームのスコアを確定（コントロール時間を積算）
  if (obj.controlled_by !== 'none' && obj.control_since) {
    const secs = (Date.now() - new Date(obj.control_since).getTime()) / 1000
    const pts  = Math.floor(secs / SCORE_SECS_PER_POINT)
    if (pts > 0) {
      const col = obj.controlled_by === 'red' ? 'score_red' : 'score_blue'
      const { data: game } = await supabase.from('games').select(col).eq('id', gameId).single()
      const cur = (game as Record<string, number> | null)?.[col] ?? 0
      await supabase.from('games').update({ [col]: cur + pts }).eq('id', gameId)
    }
  }

  await supabase.from('game_objectives').update({
    controlled_by:  capturingTeam,
    control_since:  new Date().toISOString(),
    capture_start:  null,
    capturing_team: null,
  }).eq('id', objectiveId)
}

/** 拠点占領プロセスをキャンセルする（圏外に出たとき） */
export async function cancelCapture(params: {
  objectiveId: string; playerId: string; gameId: string
}): Promise<void> {
  const { objectiveId, gameId } = params
  const supabase = createServerClient()
  await supabase.from('game_objectives')
    .update({ capture_start: null, capturing_team: null })
    .eq('id', objectiveId).eq('game_id', gameId)
}

/** ストーム圏外ダメージ（クライアントの 5 秒ティックから呼ぶ） */
export async function stormDamage(params: {
  playerId: string; deviceId: string; gameId: string
}): Promise<{ newHp: number; gameOver: boolean }> {
  const { playerId, deviceId, gameId } = params
  const supabase = createServerClient()

  const { data: game } = await supabase.from('games')
    .select('status, game_mode, hit_damage').eq('id', gameId).single()
  if (!game || game.status !== 'active') return { newHp: 0, gameOver: false }

  const { data: player } = await supabase.from('players')
    .select('id, hp, is_alive').eq('id', playerId).eq('device_id', deviceId).single()
  if (!player?.is_alive) return { newHp: 0, gameOver: false }

  const newHp = Math.max(0, player.hp - 10)
  await supabase.from('players')
    .update({ hp: newHp, is_alive: newHp > 0, killer_name: newHp === 0 ? 'ストーム' : null })
    .eq('id', playerId)

  let gameOver = false
  if (newHp === 0) {
    const { data: alive } = await supabase.from('players')
      .select('id').eq('game_id', gameId).eq('is_alive', true)
    if ((alive?.length ?? 0) <= 1) {
      gameOver = true
      await supabase.from('games')
        .update({ status: 'finished', finished_at: new Date().toISOString() })
        .eq('id', gameId)
    }
  }
  return { newHp, gameOver }
}

/** タクティクスモード: 現在の保有時間をスコアに確定する（ホストが定期呼び出し） */
export async function commitTacticsScore(params: { gameId: string }): Promise<void> {
  const { gameId } = params
  const supabase  = createServerClient()
  const now       = Date.now()

  const { data: points } = await supabase.from('game_objectives')
    .select('id, controlled_by, control_since')
    .eq('game_id', gameId).eq('type', 'control_point').neq('controlled_by', 'none')
  if (!points?.length) return

  let addRed = 0, addBlue = 0
  const updatedIds: string[] = []

  for (const p of points) {
    if (!p.control_since) continue
    const secs = (now - new Date(p.control_since).getTime()) / 1000
    const pts  = Math.floor(secs / SCORE_SECS_PER_POINT)
    if (pts <= 0) continue
    if (p.controlled_by === 'red')  addRed  += pts
    if (p.controlled_by === 'blue') addBlue += pts
    updatedIds.push(p.id)
  }

  // control_since をリセット（次の tick で二重カウントしないため）
  if (updatedIds.length > 0) {
    await supabase.from('game_objectives')
      .update({ control_since: new Date(now).toISOString() })
      .in('id', updatedIds)
  }

  if (addRed > 0 || addBlue > 0) {
    const { data: game } = await supabase.from('games')
      .select('score_red, score_blue').eq('id', gameId).single()
    await supabase.from('games').update({
      score_red:  (game?.score_red  ?? 0) + addRed,
      score_blue: (game?.score_blue ?? 0) + addBlue,
    }).eq('id', gameId)
  }
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

/**
 * キルカム画像の URL をプレイヤーレコードに保存する。
 * - gameId × targetPlayerId でプレイヤーの存在を検証（#9 バリデーション）
 * - リザルト画面での証拠写真表示に使用
 */
export async function saveKillcamUrl(params: {
  targetPlayerId: string
  gameId:         string
  url:            string
}): Promise<void> {
  const { targetPlayerId, gameId, url } = params
  const supabase = createServerClient()

  // バリデーション: そのゲームに所属するプレイヤーか確認
  const { data: player, error: findError } = await supabase
    .from('players')
    .select('id')
    .eq('id', targetPlayerId)
    .eq('game_id', gameId)
    .single()

  if (findError || !player) return  // 不正な呼び出しは無視

  await supabase
    .from('players')
    .update({ killcam_url: url })
    .eq('id', targetPlayerId)
    .eq('game_id', gameId)
}

