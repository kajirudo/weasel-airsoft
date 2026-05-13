'use server'

import { createServerClient } from '@/lib/supabase/server'
import { QR_CODE_IDS, SCORE_SECS_PER_POINT, STORM_DAMAGE_HP } from '@/lib/game/constants'
import { geoDistM } from '@/lib/game/geo'
import type { QrCodeId, MarkerMode, GameMode } from '@/types/database'

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
  /** Traitor モード: Traitor 人数 */
  traitorCount?:    number
  /** Traitor モード: Sheriff 有効 */
  sheriffEnabled?:  boolean
  /** hunting モード: 封印QR 数（fieldRadiusM を流用） */
  sealCount?:       number
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

  // ── Traitor モード: role2 をランダム割り当て ──────────────────────────
  let traitorTaskGoal = 0
  if (gameMode === 'traitor') {
    const { data: allPlayers } = await supabase
      .from('players').select('id').eq('game_id', gameId)
    if (allPlayers && allPlayers.length > 0) {
      const ids      = allPlayers.map(p => p.id)
      const shuffled = [...ids].sort(() => Math.random() - 0.5)
      const traitorCount  = params.traitorCount  ?? 1
      const sheriffEnabled = params.sheriffEnabled ?? false

      const traitorIds = shuffled.slice(0, traitorCount)
      let   sheriffId: string | null = null
      if (sheriffEnabled && shuffled.length > traitorCount) {
        sheriffId = shuffled[traitorCount]
      }

      // 全員 crew にリセット → Traitor 上書き → Sheriff 上書き
      await supabase.from('players').update({ role2: 'crew' }).eq('game_id', gameId)
      if (traitorIds.length > 0) {
        await supabase.from('players').update({ role2: 'traitor' }).in('id', traitorIds)
      }
      if (sheriffId) {
        await supabase.from('players')
          .update({ role2: 'sheriff', investigate_uses: 1 })
          .eq('id', sheriffId)
      }
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
    // Traitor モード専用
    traitor_count:    params.traitorCount   ?? 1,
    sheriff_enabled:  params.sheriffEnabled ?? false,
    task_goal:        traitorTaskGoal,
  }).eq('id', gameId).eq('status', 'lobby')
  if (error) throw new Error('ゲーム開始に失敗しました')

  // ── GPS 座標がある場合のみオブジェクト生成 ─────────────────────────────
  if (fieldCenterLat != null && fieldCenterLng != null) {
    const { data: players } = await supabase
      .from('players').select('id, role').eq('game_id', gameId)
    const playerCount   = players?.length ?? 2
    const survivorCount = players?.filter(p => p.role !== 'hunter').length ?? playerCount
    const genCount = await generateObjectivesInternal(supabase, {
      gameId, centerLat: fieldCenterLat, centerLng: fieldCenterLng,
      radiusM: fieldRadiusM, gameMode, playerCount, survivorCount,
      // ハンティングモードでは fieldRadiusM がスライダーで封印QR数として使われるため流用
      sealCount: gameMode === 'hunting' ? fieldRadiusM : (params.sealCount ?? 5),
    })
    // Traitor モード: 生成した発電機の数を task_goal に設定
    if (gameMode === 'traitor' && genCount > 0) {
      await supabase.from('games').update({ task_goal: genCount }).eq('id', gameId)
    }
  }

  // ── ハンティングモード: NPC を初期化 ─────────────────────────────────────────
  if (gameMode === 'hunting' && fieldCenterLat != null && fieldCenterLng != null) {
    const { data: players } = await supabase
      .from('players').select('id').eq('game_id', gameId)
    const playerCount = players?.length ?? 1
    const { initNPC } = await import('@/lib/game/npcActions')
    await initNPC({ gameId, lat: fieldCenterLat, lng: fieldCenterLng, playerCount })
  }
}

/** オブジェクトをフィールドにランダム散布する（startGame 内から呼ぶ内部関数）
 *  @returns 生成した generator の個数
 */
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
    sealCount?:    number
  },
): Promise<number> {
  const { gameId, centerLat, centerLng, radiusM, gameMode, playerCount, survivorCount } = params
  const sealCount = params.sealCount ?? 5

  type ObjInsert = {
    game_id:    string; lat: number; lng: number; type: string;
    seal_index?: number
  }
  const inserts: ObjInsert[] = []

  // ハンティングモード: 封印QR のみ散布
  if (gameMode === 'hunting') {
    const fieldR = Math.max(20, sealCount * 20)  // 封印QR数×20m を散布半径に
    const points = scatterPoints(centerLat, centerLng, sealCount, fieldR, 15)
    for (let i = 0; i < points.length; i++) {
      inserts.push({
        game_id:    gameId,
        lat:        points[i].lat,
        lng:        points[i].lng,
        type:       'seal',
        seal_index: i + 1,
      })
    }
    if (inserts.length > 0) await supabase.from('game_objectives').insert(inserts)
    return 0  // generator 数は 0（hunting は task_goal 不使用）
  }

  // タイプ別の個数を決定（既存モード）
  const counts = gameMode === 'survival'
    ? { generator: survivorCount + 1, medkit: Math.max(1, survivorCount - 1), damage_boost: 2, control_point: 0 }
    : gameMode === 'tactics'
    ? { generator: 0, medkit: 2, damage_boost: 2, control_point: 3 }
    : gameMode === 'traitor'
    ? { generator: playerCount + 1, medkit: Math.max(1, playerCount - 1), damage_boost: 0, control_point: 0 }
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
  return counts.generator
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
    .update({ lat, lng, heading, last_seen: new Date().toISOString() })
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
    .select('type, is_activated, activating_by').eq('id', objectiveId).eq('game_id', gameId).single()
  if (!obj || obj.type !== 'generator') throw new Error('発電機ではありません')
  if (obj.is_activated) throw new Error('すでに起動済みです')
  if (obj.activating_by && obj.activating_by !== playerId) throw new Error('他のプレイヤーが起動中です')

  // activating_by IS NULL を条件にして競合防止（他プレイヤーが同時に beginGenerator した場合は片方が 0 rows）
  const { data: claimed } = await supabase.from('game_objectives')
    .update({ activate_start: new Date().toISOString(), activating_by: playerId })
    .eq('id', objectiveId).is('activating_by', null)
    .select('id')
  if (!claimed || claimed.length === 0) throw new Error('他のプレイヤーが起動中です')
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
  const { objectiveId, playerId, gameId } = params
  const supabase = createServerClient()

  // 自分のチームが占領中の場合のみキャンセル可（他チームのプロセスを横から止めない）
  const { data: player } = await supabase.from('players')
    .select('team').eq('id', playerId).eq('game_id', gameId).single()
  if (!player) return

  await supabase.from('game_objectives')
    .update({ capture_start: null, capturing_team: null })
    .eq('id', objectiveId).eq('game_id', gameId)
    .eq('capturing_team', player.team)
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

  const newHp = Math.max(0, player.hp - STORM_DAMAGE_HP)
  await supabase.from('players')
    .update({ hp: newHp, is_alive: newHp > 0, killer_name: newHp === 0 ? 'ストーム' : null })
    .eq('id', playerId)

  let gameOver = false
  if (newHp === 0) {
    const { data: alive } = await supabase.from('players')
      .select('id, name').eq('game_id', gameId).eq('is_alive', true)
    if ((alive?.length ?? 0) <= 1) {
      gameOver = true
      const lastSurvivor = alive?.[0] ?? null
      await supabase.from('games')
        .update({
          status:      'finished',
          finished_at: new Date().toISOString(),
          // チームモードなら red/blue、個人戦なら winner_id で識別（winner_team は null）
          winner_id:   lastSurvivor?.id ?? null,
        })
        .eq('id', gameId)
    }
  }
  return { newHp, gameOver }
}

/** タクティクスモード: 現在の保有時間をスコアに確定する（ホストが定期呼び出し）
 *  Postgres RPC でアトミックに実行するため二重カウントが発生しない。
 */
export async function commitTacticsScore(params: { gameId: string }): Promise<void> {
  const { gameId } = params
  const supabase  = createServerClient()
  await supabase.rpc('commit_tactics_score', { p_game_id: gameId })
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

// ══════════════════════════════════════════════════════════════════════════════
//  Traitor モード専用アクション
// ══════════════════════════════════════════════════════════════════════════════

import type { PlayerRole2 } from '@/types/database'
import { MEETING_DURATION_MS, SABOTAGE_DURATION_MS } from '@/lib/game/constants'

/** 自分の role2 を取得（デバイス ID で本人確認） */
export async function getMyRole(params: {
  playerId: string
  deviceId: string
}): Promise<{
  role2:            PlayerRole2
  meeting_uses:     number
  investigate_uses: number
  allTraitorIds:    string[]   // Traitor 本人には仲間の ID を開示
}> {
  const { playerId, deviceId } = params
  const supabase = createServerClient()

  const { data: player } = await supabase.from('players')
    .select('role2, meeting_uses, investigate_uses, game_id')
    .eq('id', playerId).eq('device_id', deviceId).single()
  if (!player) throw new Error('プレイヤーが見つかりません')

  let allTraitorIds: string[] = []
  if (player.role2 === 'traitor') {
    // 仲間の Traitor ID を開示（自分も含む）
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

  // 招集権チェック（meeting_uses > 0 かつ生存）
  const { data: player } = await supabase.from('players')
    .select('is_alive, meeting_uses')
    .eq('id', callerId).eq('device_id', deviceId).eq('game_id', gameId).single()
  if (!player?.is_alive)       throw new Error('戦闘不能です')
  if (!player.meeting_uses)    throw new Error('集会を招集する権利がありません')

  // 集会中チェック
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
  targetId:  string | null   // null = スキップ
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

  // 本人確認
  const { data: voter } = await supabase.from('players')
    .select('is_alive').eq('id', voterId).eq('device_id', deviceId).eq('game_id', gameId).single()
  if (!voter?.is_alive) throw new Error('戦闘不能です')

  // 投票を記録（同じ集会では上書き可能）
  await supabase.from('traitor_votes').upsert(
    { game_id: gameId, meeting_id: meetingId, voter_id: voterId, target_id: targetId },
    { onConflict: 'meeting_id,voter_id' }
  )

  // 全生存者数 vs 投票数
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

  // 集計
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

  // 期限チェック
  if (new Date() < new Date(game.meeting_until ?? '')) return { resolved: false }

  // 本人確認（+ game_id で所属ゲームも検証）
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
  // 最多票のプレイヤーを追放
  const { data: votes } = await supabase.from('traitor_votes')
    .select('target_id').eq('meeting_id', meetingId).not('target_id', 'is', null)

  let exileId: string | null = null
  if (votes && votes.length > 0) {
    const tally = new Map<string, number>()
    for (const v of votes) {
      if (v.target_id) tally.set(v.target_id, (tally.get(v.target_id) ?? 0) + 1)
    }
    const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1])
    // 同票の場合は追放なし（スキップ相当）
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

  // 集会を閉じる（meeting_id 条件付き UPDATE = 二重実行防止）
  const { data: closedRows } = await supabase.from('games')
    .update({ meeting_id: null, meeting_until: null })
    .eq('id', gameId).eq('meeting_id', meetingId)
    .select('id')
  // 他のクライアントが先に集会を閉じていた場合（0行更新）は中断
  if (!closedRows?.length) return { resolved: false }

  // 勝利判定
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

  // GPS 近接チェック（位置情報がある場合のみ）
  if (sheriff.lat != null && target.lat != null) {
    const dlat = (sheriff.lat - target.lat) * 111_320
    const dlng = (sheriff.lng - target.lng) * 111_320 * Math.cos(sheriff.lat * Math.PI / 180)
    const dist = Math.sqrt(dlat ** 2 + dlng ** 2)
    if (dist > 15) throw new Error(`対象が遠すぎます（${Math.round(dist)}m）`)
  }

  await supabase.from('players')
    .update({ investigate_uses: sheriff.investigate_uses - 1 }).eq('id', sheriffId)

  return { role2: target.role2 as PlayerRole2 }
}

/**
 * タスク完了 — Migration 012 の complete_mission RPC を呼ぶことで
 * task_done インクリメントをサーバー側で FOR UPDATE + RETURNING によりアトミックに実行する。
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

