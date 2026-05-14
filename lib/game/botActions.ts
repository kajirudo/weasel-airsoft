'use server'

/**
 * botActions — ソロプレイ用ボット管理 Server Actions
 *
 * セキュリティモデル:
 *  - spawnBots:        startGame から service_role で呼び出し（ホストの gameId で認証）
 *  - updateBotPositions: controller_id（ホストの playerId）+ device_id で認証
 *  - botAttack:        同上
 *  - playerShootBot:   プレイヤーの device_id + GPS 距離でサーバー側検証
 *  - botVoteAll:       ホストの device_id で認証
 */

import { createServerClient } from '@/lib/supabase/server'
import { geoDistM, randomGeoPoint } from '@/lib/game/geo'
import {
  BOT_NAMES, BOT_SHOOT_RANGE_M, BOT_SHOOT_COOLDOWN_MS,
  type BotDifficulty,
} from '@/lib/game/constants'
import type { QrCodeId, BotBehavior, GameMode, Team } from '@/types/database'

// ── ボットスポーン ─────────────────────────────────────────────────────────────

/**
 * ゲーム開始時にボットをスポーンする（startGame から内部呼び出し）。
 * ボットは players テーブルに is_bot=true で挿入される。
 */
export async function spawnBots(params: {
  gameId:       string
  gameMode:     GameMode
  botCount:     number
  difficulty:   BotDifficulty
  fieldCenterLat: number
  fieldCenterLng: number
  fieldRadiusM:   number
  /** traitor モード時の Traitor 人数（spy_bot 割り当てに使用） */
  traitorCount?: number
  /** タクティクスモード時のプレイヤーチーム（対立チームにボットを割り当て） */
  playerTeam?:  Team
}): Promise<void> {
  const {
    gameId, gameMode, botCount, difficulty,
    fieldCenterLat, fieldCenterLng, fieldRadiusM,
  } = params
  if (botCount <= 0) return

  const supabase = createServerClient()

  // ── ボットの初期 GPS 位置をフィールド内にランダム散布（0.3〜0.8倍の距離に配置） ──
  function randomNear(lat: number, lng: number, r: number) {
    return randomGeoPoint(lat, lng, r, 0.3)
  }

  // ── モード別の行動パターンと役割を決定 ────────────────────────────────────
  type BotInit = {
    behavior: BotBehavior
    role:  'survivor' | 'hunter'
    role2: 'crew' | 'traitor' | 'sheriff'
    team:  Team
    hp:    number
  }

  function assignBots(): BotInit[] {
    const bots: BotInit[] = []

    if (gameMode === 'traitor') {
      // traitor モード: 1体がspy_bot、残りがcrew_bot
      const spyCount = Math.min(params.traitorCount ?? 1, botCount)
      for (let i = 0; i < botCount; i++) {
        const isSpy = i < spyCount
        bots.push({
          behavior: isSpy ? 'spy_bot' : 'crew_bot',
          role:  'survivor',
          role2: isSpy ? 'traitor' : 'crew',
          team:  'none',
          hp:    100,
        })
      }
    } else if (gameMode === 'tactics') {
      // tactics: プレイヤーの対立チームに全ボット
      const botTeam: Team = params.playerTeam === 'red' ? 'blue' : 'red'
      for (let i = 0; i < botCount; i++) {
        bots.push({ behavior: 'defender', role: 'survivor', role2: 'crew', team: botTeam, hp: 100 })
      }
    } else if (gameMode === 'survival') {
      // survival: 1体がhunterボット（rusher）、残りはroamer
      for (let i = 0; i < botCount; i++) {
        const isHunter = i === 0
        bots.push({
          behavior: isHunter ? 'rusher' : 'roamer',
          role:     isHunter ? 'hunter' : 'survivor',
          role2:    'crew',
          team:     'none',
          hp:       isHunter ? 200 : 100,
        })
      }
    } else {
      // deathmatch / battle: すべて roamer
      for (let i = 0; i < botCount; i++) {
        bots.push({ behavior: 'roamer', role: 'survivor', role2: 'crew', team: 'none', hp: 100 })
      }
    }
    return bots
  }

  const botInits = assignBots()
  const now      = new Date().toISOString()

  const inserts = botInits.map((b, i) => {
    const pos = randomNear(fieldCenterLat, fieldCenterLng, fieldRadiusM)
    return {
      game_id:      gameId,
      name:         BOT_NAMES[i % BOT_NAMES.length],
      hp:           b.hp,
      qr_code_id:   `bot_${i + 1}` as QrCodeId,
      device_id:    `bot_device_${gameId}_${i}`,  // ゲーム固有の一意 ID
      is_alive:     true,
      joined_at:    now,
      last_seen:    now,
      kills:        0,
      team:         b.team,
      role:         b.role,
      role2:        b.role2,
      is_bot:       true,
      bot_behavior: b.behavior,
      lat:          pos.lat,
      lng:          pos.lng,
      heading:      0,
    }
  })

  await supabase.from('players').insert(inserts)
}

// ── ボット一括移動 ─────────────────────────────────────────────────────────────

export interface BotMove {
  botId:   string
  newLat:  number
  newLng:  number
  heading: number
}

/**
 * ホストが全ボットの座標をまとめて更新する。
 * controller_id + device_id でホストを認証する。
 */
export async function updateBotPositions(params: {
  gameId:       string
  controllerId: string
  deviceId:     string
  moves:        BotMove[]
}): Promise<void> {
  const { gameId, controllerId, deviceId, moves } = params
  if (moves.length === 0) return

  const supabase = createServerClient()

  // ホスト認証（controller の device_id 確認）
  const { data: host } = await supabase.from('players')
    .select('id').eq('id', controllerId).eq('device_id', deviceId)
    .eq('game_id', gameId).single()
  if (!host) return

  // 各ボットを並行更新
  await Promise.all(moves.map(({ botId, newLat, newLng, heading }) =>
    supabase.from('players')
      .update({ lat: newLat, lng: newLng, heading, last_seen: new Date().toISOString() })
      .eq('id', botId).eq('game_id', gameId).eq('is_bot', true),
  ))
}

// ── ボット → プレイヤー攻撃 ──────────────────────────────────────────────────

/**
 * ボットが人間プレイヤーを攻撃する（ホストの controller ループから呼び出し）。
 * サーバー側で GPS 距離・クールダウンを検証する。
 */
export async function botAttack(params: {
  gameId:       string
  controllerId: string
  deviceId:     string
  botId:        string
  targetId:     string   // 攻撃対象の人間プレイヤー ID
  difficulty?:  BotDifficulty
}): Promise<{ hit: boolean }> {
  const { gameId, controllerId, deviceId, botId, targetId, difficulty = 'normal' } = params
  const supabase = createServerClient()

  // ホスト認証
  const { data: host } = await supabase.from('players')
    .select('id').eq('id', controllerId).eq('device_id', deviceId).eq('game_id', gameId).single()
  if (!host) return { hit: false }

  const [{ data: bot }, { data: target }, { data: game }] = await Promise.all([
    supabase.from('players').select('id, hp, is_alive, lat, lng, is_bot, last_shot_at, bot_behavior, name')
      .eq('id', botId).eq('game_id', gameId).single(),
    supabase.from('players').select('id, hp, is_alive, lat, lng, kills')
      .eq('id', targetId).eq('game_id', gameId).single(),
    supabase.from('games').select('status, hit_damage').eq('id', gameId).single(),
  ])

  if (!bot?.is_bot || !bot.is_alive) return { hit: false }
  if (!target?.is_alive)             return { hit: false }
  if (game?.status !== 'active')     return { hit: false }
  if (!bot.lat || !bot.lng || !target.lat || !target.lng) return { hit: false }

  // GPS 距離チェック
  if (geoDistM({ lat: bot.lat, lng: bot.lng }, { lat: target.lat, lng: target.lng }) > BOT_SHOOT_RANGE_M) {
    return { hit: false }
  }

  // クールダウンチェック（last_shot_at を流用）
  const lastShot = bot.last_shot_at ? new Date(bot.last_shot_at).getTime() : 0
  if (Date.now() - lastShot < BOT_SHOOT_COOLDOWN_MS[difficulty]) return { hit: false }

  const hitDamage = game?.hit_damage ?? 25
  const newHp     = Math.max(0, target.hp - hitDamage)
  const now       = new Date().toISOString()

  await Promise.all([
    supabase.from('players').update({
      hp:          newHp,
      is_alive:    newHp > 0,
      killer_name: newHp === 0 ? bot.name : null,
    }).eq('id', targetId),
    supabase.from('players').update({ last_shot_at: now }).eq('id', botId),
  ])

  // ゲーム終了チェック
  if (newHp === 0) {
    await checkAndMaybeFinish(supabase, gameId)
  }

  return { hit: true }
}

// ── プレイヤー → ボット攻撃 ──────────────────────────────────────────────────

/**
 * 人間プレイヤーがボットを攻撃する。
 * GPS 距離・本人確認・クールダウンをサーバー側で検証。
 */
export async function playerShootBot(params: {
  gameId:   string
  playerId: string
  deviceId: string
  botId:    string
}): Promise<{ hit: boolean; newBotHp: number; gameOver: boolean }> {
  const { gameId, playerId, deviceId, botId } = params
  const supabase = createServerClient()

  const [{ data: player }, { data: bot }, { data: game }] = await Promise.all([
    supabase.from('players')
      .select('id, name, hp, is_alive, lat, lng, last_shot_at, kills')
      .eq('id', playerId).eq('device_id', deviceId).eq('game_id', gameId).single(),
    supabase.from('players')
      .select('id, hp, is_alive, lat, lng, is_bot')
      .eq('id', botId).eq('game_id', gameId).single(),
    supabase.from('games')
      .select('status, hit_damage, shoot_cooldown').eq('id', gameId).single(),
  ])

  if (!player?.is_alive)          return { hit: false, newBotHp: 0, gameOver: false }
  if (!bot?.is_bot || !bot.is_alive) return { hit: false, newBotHp: 0, gameOver: false }
  if (game?.status !== 'active')  return { hit: false, newBotHp: 0, gameOver: false }

  // GPS 距離チェック
  if (!player.lat || !player.lng || !bot.lat || !bot.lng) {
    return { hit: false, newBotHp: 0, gameOver: false }
  }
  if (geoDistM({ lat: player.lat, lng: player.lng }, { lat: bot.lat, lng: bot.lng }) > BOT_SHOOT_RANGE_M) {
    return { hit: false, newBotHp: 0, gameOver: false }
  }

  // 射撃クールダウン（プレイヤーの通常クールダウンを流用）
  const cooldownMs = game?.shoot_cooldown ?? 800
  const lastShot   = player.last_shot_at ? new Date(player.last_shot_at).getTime() : 0
  if (Date.now() - lastShot < cooldownMs) return { hit: false, newBotHp: 0, gameOver: false }

  const hitDamage = game?.hit_damage ?? 25
  const newBotHp  = Math.max(0, bot.hp - hitDamage)
  const now       = new Date().toISOString()

  await Promise.all([
    supabase.from('players').update({
      hp:          newBotHp,
      is_alive:    newBotHp > 0,
      killer_name: newBotHp === 0 ? player.name : null,
    }).eq('id', botId),
    supabase.from('players').update({
      last_shot_at: now,
      kills: newBotHp === 0 ? (player.kills + 1) : player.kills,
    }).eq('id', playerId),
  ])

  let gameOver = false
  if (newBotHp === 0) {
    gameOver = await checkAndMaybeFinish(supabase, gameId, playerId)
  }

  return { hit: true, newBotHp, gameOver }
}

// ── ボット一括投票（Traitor モード） ─────────────────────────────────────────

/**
 * 集会中、全ボットが自動投票する。ホストのコントローラーから呼ばれる。
 */
export async function botVoteAll(params: {
  gameId:       string
  controllerId: string
  deviceId:     string
  meetingId:    string
}): Promise<void> {
  const { gameId, controllerId, deviceId, meetingId } = params
  const supabase = createServerClient()

  // ホスト認証
  const { data: host } = await supabase.from('players')
    .select('id').eq('id', controllerId).eq('device_id', deviceId).eq('game_id', gameId).single()
  if (!host) return

  // ゲームの集会が有効か確認
  const { data: game } = await supabase.from('games')
    .select('meeting_id').eq('id', gameId).single()
  if (game?.meeting_id !== meetingId) return

  // 全ボットと全生存プレイヤーを取得
  const { data: allPlayers } = await supabase.from('players')
    .select('id, is_bot, bot_behavior, is_alive').eq('game_id', gameId)
  if (!allPlayers) return

  const aliveBots    = allPlayers.filter(p => p.is_bot && p.is_alive)
  const alivePlayers = allPlayers.filter(p => p.is_alive)

  // 既に投票済みのボットは除外
  const { data: existingVotes } = await supabase.from('traitor_votes')
    .select('voter_id').eq('meeting_id', meetingId)
  const votedIds = new Set(existingVotes?.map(v => v.voter_id) ?? [])

  const voteInserts: { game_id: string; meeting_id: string; voter_id: string; target_id: string | null }[] = []

  for (const bot of aliveBots) {
    if (votedIds.has(bot.id)) continue

    const others = alivePlayers.filter(p => p.id !== bot.id)
    const isSpy  = bot.bot_behavior === 'spy_bot'

    // spy_bot は非スパイに投票、crew_bot はランダム
    const nonSpies   = others.filter(p => p.bot_behavior !== 'spy_bot')
    const candidates = isSpy ? (nonSpies.length > 0 ? nonSpies : others) : others

    const target = candidates.length > 0
      ? candidates[Math.floor(Math.random() * candidates.length)]
      : null

    voteInserts.push({
      game_id:    gameId,
      meeting_id: meetingId,
      voter_id:   bot.id,
      target_id:  target?.id ?? null,
    })
  }

  if (voteInserts.length > 0) {
    await supabase.from('traitor_votes').insert(voteInserts)
  }
}

// ── タスク自動完了（Traitor モード crew_bot） ────────────────────────────────

/**
 * crew_bot が発電機タスクを 1 つ自動完了する。
 * ホストのコントローラーから定期呼び出し。
 */
export async function botCompleteTask(params: {
  gameId:       string
  controllerId: string
  deviceId:     string
}): Promise<void> {
  const { gameId, controllerId, deviceId } = params
  const supabase = createServerClient()

  const { data: host } = await supabase.from('players')
    .select('id').eq('id', controllerId).eq('device_id', deviceId).eq('game_id', gameId).single()
  if (!host) return

  const { data: game } = await supabase.from('games')
    .select('status, game_mode, task_done, task_goal').eq('id', gameId).single()
  if (game?.status !== 'active' || game.game_mode !== 'traitor') return
  if ((game.task_done ?? 0) >= (game.task_goal ?? 0)) return

  const newTaskDone = (game.task_done ?? 0) + 1
  await supabase.from('games')
    .update({ task_done: newTaskDone }).eq('id', gameId)

  // タスク全完了チェック → Crew 勝利
  if (newTaskDone >= (game.task_goal ?? 1)) {
    // Traitor モードの Crew 勝利と同じ処理
    await supabase.from('games').update({
      status:      'finished',
      finished_at: new Date().toISOString(),
      winner_team: 'crew',
    }).eq('id', gameId)
  }
}

// ── 共有ゲーム終了チェック ────────────────────────────────────────────────────

/**
 * 生存プレイヤー数を確認し、必要ならゲームを終了する。
 * bot / 人間 両方の死亡後に呼び出す。
 * @returns ゲームが終了した場合 true
 */
async function checkAndMaybeFinish(
  supabase: ReturnType<typeof createServerClient>,
  gameId: string,
  winnerId?: string,
): Promise<boolean> {
  const { data: game } = await supabase.from('games')
    .select('status, game_mode').eq('id', gameId).single()
  if (game?.status !== 'active') return false

  // タクティクスはこのロジックで終了しない（別の条件で終了）
  if (game.game_mode === 'tactics') return false

  const { data: alive } = await supabase.from('players')
    .select('id, name, is_bot, role2, bot_behavior')
    .eq('game_id', gameId).eq('is_alive', true)
  if (!alive) return false

  const aliveHumans = alive.filter(p => !p.is_bot)
  const aliveBots   = alive.filter(p => p.is_bot)
  const now = new Date().toISOString()

  // ── Traitor モード終了判定（生存数に関わらず毎回チェック） ─────────────────
  if (game.game_mode === 'traitor') {
    // Crew 勝利: 生存スパイ（spy_bot + 人間 Traitor）が 0
    const aliveSpyBots      = aliveBots.filter(b => b.bot_behavior === 'spy_bot')
    const aliveHumanTraitors = aliveHumans.filter(h => h.role2 === 'traitor')
    if (aliveSpyBots.length === 0 && aliveHumanTraitors.length === 0) {
      await supabase.from('games').update({
        status: 'finished', finished_at: now, winner_team: 'crew',
      }).eq('id', gameId)
      return true
    }

    // Traitor 勝利: 生存クルー（人間クルー + crew_bot）が 0
    const aliveCrewHumans = aliveHumans.filter(h => h.role2 !== 'traitor')
    const aliveCrewBots   = aliveBots.filter(b => b.bot_behavior === 'crew_bot')
    if (aliveCrewHumans.length === 0 && aliveCrewBots.length === 0) {
      await supabase.from('games').update({
        status: 'finished', finished_at: now, winner_team: 'traitor',
      }).eq('id', gameId)
      return true
    }
    return false
  }

  // ── deathmatch / battle / survival: 全員死亡 or 1 人のみ残った場合に終了 ──
  if (alive.length > 1) return false

  const lastOne = alive[0] ?? null
  await supabase.from('games').update({
    status:      'finished',
    finished_at: now,
    winner_id:   lastOne?.id ?? winnerId ?? null,
    winner_team: null,
  }).eq('id', gameId)
  return true
}

