/**
 * botAI — ソロプレイ用ボット AI の純粋関数群
 *
 * サーバー・クライアント両方から import できる（ディレクティブなし）。
 * 乱数・時刻は呼び出し側で生成して渡す（テスト容易性）。
 */

import { geoDistM, bearingDeg } from '@/lib/game/geo'
import type { Player, GameObjective, BotBehavior } from '@/types/database'
import { BOT_SHOOT_RANGE_M } from '@/lib/game/constants'

// ── 型定義 ────────────────────────────────────────────────────────────────────

export interface BotMoveResult {
  newLat:  number
  newLng:  number
  heading: number
}

// ── ユーティリティ ────────────────────────────────────────────────────────────

/** フィールド内のランダム点を生成 */
export function randomFieldPoint(
  centerLat: number, centerLng: number, radiusM: number,
): { lat: number; lng: number } {
  const angle      = Math.random() * 2 * Math.PI
  const r          = radiusM * Math.sqrt(Math.random())
  const mPerDegLat = 111_320
  const mPerDegLng = 111_320 * Math.cos(centerLat * Math.PI / 180)
  return {
    lat: centerLat + (r * Math.cos(angle)) / mPerDegLat,
    lng: centerLng + (r * Math.sin(angle)) / mPerDegLng,
  }
}

/** ボットを target に向けて 1 ステップ移動した新座標を計算 */
export function stepToward(
  bot: { lat: number; lng: number },
  target: { lat: number; lng: number },
  speedMps: number,
  dtSec: number,
): BotMoveResult {
  const heading    = bearingDeg(bot, target)
  const stepM      = speedMps * dtSec
  const mPerDegLat = 111_320
  const mPerDegLng = 111_320 * Math.cos(bot.lat * Math.PI / 180)
  return {
    newLat:  bot.lat + (stepM * Math.cos(heading * Math.PI / 180)) / mPerDegLat,
    newLng:  bot.lng + (stepM * Math.sin(heading * Math.PI / 180)) / mPerDegLng,
    heading,
  }
}

// ── 行動パターン別 移動ターゲット選択 ────────────────────────────────────────

/**
 * ボットの次の移動目標を返す。
 * @returns lat/lng（移動先）
 */
export function getBotMoveTarget(params: {
  bot:          Player           // is_bot=true のボット
  behavior:     BotBehavior
  humanPlayers: Player[]         // is_bot=false の生存プレイヤー
  allPlayers:   Player[]         // 全プレイヤー（ボット含む）
  objectives:   GameObjective[]
  fieldCenter:  { lat: number; lng: number }
  fieldRadiusM: number
}): { lat: number; lng: number } {
  const { bot, behavior, humanPlayers, objectives, fieldCenter, fieldRadiusM } = params

  // 生存している人間プレイヤー（GPS あり）
  const livingHumans = humanPlayers.filter(
    p => p.is_alive && p.lat != null && p.lng != null,
  )

  switch (behavior) {
    // ── 徘徊: 最寄りの人間に向かう（いなければランダム徘徊）
    case 'roamer':
    case 'crew_bot': {
      const nearest = getNearestPlayer(bot, livingHumans)
      if (nearest && geoDistM(bot as { lat: number; lng: number }, { lat: nearest.lat!, lng: nearest.lng! }) > 30) {
        return { lat: nearest.lat!, lng: nearest.lng! }
      }
      return randomFieldPoint(fieldCenter.lat, fieldCenter.lng, fieldRadiusM)
    }

    // ── 突進: 最寄りの人間に常に向かう
    case 'rusher':
    case 'spy_bot': {
      const nearest = getNearestPlayer(bot, livingHumans)
      if (nearest) return { lat: nearest.lat!, lng: nearest.lng! }
      return randomFieldPoint(fieldCenter.lat, fieldCenter.lng, fieldRadiusM)
    }

    // ── 防衛: 未占領の拠点 or 発電機に向かう
    case 'defender': {
      // まず未占領（自チーム以外）の拠点を探す
      const enemyPoints = objectives.filter(
        o => o.type === 'control_point' && o.controlled_by !== bot.team,
      )
      const nearestCP = getNearestObjective(bot, enemyPoints)
      if (nearestCP) return { lat: nearestCP.lat, lng: nearestCP.lng }
      // 拠点がなければランダム徘徊
      return randomFieldPoint(fieldCenter.lat, fieldCenter.lng, fieldRadiusM)
    }
  }
}

// ── 攻撃判定 ─────────────────────────────────────────────────────────────────

/**
 * ボットが射撃可能かチェック。
 * @returns 攻撃すべき対象プレイヤー（なければ null）
 */
export function getBotAttackTarget(params: {
  bot:          Player
  humanPlayers: Player[]
  lastShotAt:   number   // ボットの最終射撃 UNIX ms
  cooldownMs:   number
  accuracy:     number   // 0〜1 の命中率
  now:          number
}): Player | null {
  const { bot, humanPlayers, lastShotAt, cooldownMs, accuracy, now } = params
  if (!bot.lat || !bot.lng) return null
  if (now - lastShotAt < cooldownMs) return null

  const inRange = humanPlayers.filter(p => {
    if (!p.is_alive || !p.lat || !p.lng) return false
    return geoDistM(
      { lat: bot.lat!, lng: bot.lng! },
      { lat: p.lat,   lng: p.lng   },
    ) <= BOT_SHOOT_RANGE_M
  })

  if (inRange.length === 0) return null
  if (Math.random() > accuracy) return null  // 命中率チェック

  // 最も近い人間を優先
  return inRange.reduce((a, b) => {
    const da = geoDistM({ lat: bot.lat!, lng: bot.lng! }, { lat: a.lat!, lng: a.lng! })
    const db = geoDistM({ lat: bot.lat!, lng: bot.lng! }, { lat: b.lat!, lng: b.lng! })
    return da <= db ? a : b
  })
}

// ── 投票ロジック（Traitor モード） ────────────────────────────────────────────

/**
 * ボットの投票先を決定する。
 * crew_bot: 人間プレイヤーの中からランダムに 1 人（怪しい人を推測）
 * spy_bot:  別のボット or 人間をランダムに投票（証拠隠滅）
 * @returns 投票対象の playerId（スキップは null）
 */
export function decideBotVote(params: {
  bot:        Player
  alivePlayers: Player[]  // 自分以外の生存プレイヤー（ボット含む）
}): string | null {
  const { bot, alivePlayers } = params
  const candidates = alivePlayers.filter(p => p.id !== bot.id && p.is_alive)
  if (candidates.length === 0) return null

  if (bot.bot_behavior === 'spy_bot') {
    // spy_bot はクルーボットや人間に投票（自分が見逃される確率を上げる）
    const nonSpies = candidates.filter(p => p.bot_behavior !== 'spy_bot')
    const pool     = nonSpies.length > 0 ? nonSpies : candidates
    return pool[Math.floor(Math.random() * pool.length)].id
  }

  // crew_bot は人間プレイヤーを優先（spy_bot を絞り込めないため完全ランダム）
  return candidates[Math.floor(Math.random() * candidates.length)].id
}

// ── ヘルパー ──────────────────────────────────────────────────────────────────

function getNearestPlayer(
  from: Player, players: Player[],
): Player | null {
  if (!from.lat || !from.lng || players.length === 0) return null
  return players.reduce<Player | null>((best, p) => {
    if (!p.lat || !p.lng) return best
    if (!best || !best.lat || !best.lng) return p
    const dA = geoDistM({ lat: from.lat!, lng: from.lng! }, { lat: best.lat, lng: best.lng })
    const dB = geoDistM({ lat: from.lat!, lng: from.lng! }, { lat: p.lat,    lng: p.lng    })
    return dB < dA ? p : best
  }, null)
}

function getNearestObjective(
  from: Player, objs: GameObjective[],
): GameObjective | null {
  if (!from.lat || !from.lng || objs.length === 0) return null
  return objs.reduce<GameObjective | null>((best, o) => {
    if (!best) return o
    const dA = geoDistM({ lat: from.lat!, lng: from.lng! }, { lat: best.lat, lng: best.lng })
    const dB = geoDistM({ lat: from.lat!, lng: from.lng! }, { lat: o.lat,    lng: o.lng    })
    return dB < dA ? o : best
  }, null)
}
