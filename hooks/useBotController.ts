'use client'

/**
 * useBotController — ソロプレイ用ボット制御フック
 *
 * useNPCController と同じ設計:
 *   - ホスト（isController=true）のみ実行
 *   - BOT_MOVE_INTERVAL_MS（2秒）ごとにループ
 *   - ボットの移動・攻撃・Traitor タスク完了を管理
 */

import { useEffect, useRef, useCallback } from 'react'
import type { Player, GameObjective, GameMode } from '@/types/database'
import type { GeoPosition }                     from '@/hooks/useRadar'
import type { LocalPlayerSession }              from '@/types/game'
import {
  BOT_MOVE_INTERVAL_MS, BOT_TASK_COMPLETE_MS,
  type BotDifficulty,
} from '@/lib/game/constants'
import { getBotMoveTarget, getBotAttackTarget, stepToward, randomFieldPoint } from '@/lib/game/botAI'
import { BOT_ACCURACY, BOT_SPEED_MPS, BOT_SHOOT_COOLDOWN_MS } from '@/lib/game/constants'
import {
  updateBotPositions, botAttack, botVoteAll, botCompleteTask,
} from '@/lib/game/botActions'

interface Props {
  gameId:       string
  session:      LocalPlayerSession | null
  /** is_bot=true のボット一覧 */
  bots:         Player[]
  /** 全プレイヤー（ボット含む） */
  players:      Player[]
  objectives:   GameObjective[]
  gameMode:     GameMode
  /** 集会中の meetingId（変化を検知して一括投票） */
  meetingId:    string | null
  fieldCenter:  { lat: number; lng: number } | null
  fieldRadiusM: number
  difficulty:   BotDifficulty
  isController: boolean
  enabled:      boolean
}

export function useBotController({
  gameId, session, bots, players, objectives, gameMode,
  meetingId, fieldCenter, fieldRadiusM, difficulty,
  isController, enabled,
}: Props) {
  // 最新値を ref で保持（stale closure 対策 — NPC コントローラーと同じ手法）
  const botsRef         = useRef(bots)
  const playersRef      = useRef(players)
  const objectivesRef   = useRef(objectives)
  const sessionRef      = useRef(session)
  const meetingIdRef    = useRef(meetingId)
  const fieldCenterRef  = useRef(fieldCenter)
  const difficultyRef   = useRef(difficulty)
  const votedMeetingRef = useRef<string | null>(null)  // 同じ集会で二重投票しない
  const lastTaskRef     = useRef<number>(0)            // crew_bot タスク完了タイマー

  botsRef.current        = bots
  playersRef.current     = players
  objectivesRef.current  = objectives
  sessionRef.current     = session
  meetingIdRef.current   = meetingId
  fieldCenterRef.current = fieldCenter
  difficultyRef.current  = difficulty

  const tick = useCallback(async () => {
    const ses         = sessionRef.current
    const bs          = botsRef.current
    const ps          = playersRef.current
    const objs        = objectivesRef.current
    const center      = fieldCenterRef.current
    const diff        = difficultyRef.current
    const currentMid  = meetingIdRef.current

    if (!ses || !center) return

    const controllerId = ses.playerId
    const deviceId     = ses.deviceId
    const now          = Date.now()
    const dtSec        = BOT_MOVE_INTERVAL_MS / 1000

    // 生存ボット・生存人間プレイヤー
    const aliveBots    = bs.filter(b => b.is_alive && b.lat != null && b.lng != null)
    const humanPlayers = ps.filter(p => !p.is_bot && p.is_alive && p.lat != null)

    if (aliveBots.length === 0) return

    // ── 1. 集会中はボット投票のみ ─────────────────────────────────────────
    if (currentMid) {
      if (votedMeetingRef.current !== currentMid) {
        votedMeetingRef.current = currentMid
        botVoteAll({ gameId, controllerId, deviceId, meetingId: currentMid }).catch(() => {})
      }
      return  // 集会中は移動・攻撃なし
    }

    // ── 2. crew_bot タスク自動完了（Traitor モード、40秒ごと） ──────────────
    if (gameMode === 'traitor' && now - lastTaskRef.current >= BOT_TASK_COMPLETE_MS) {
      lastTaskRef.current = now
      const hasCrewBot = aliveBots.some(b => b.bot_behavior === 'crew_bot')
      if (hasCrewBot) {
        botCompleteTask({ gameId, controllerId, deviceId }).catch(() => {})
      }
    }

    // ── 3. 各ボットの移動計算 ────────────────────────────────────────────
    const moves: { botId: string; newLat: number; newLng: number; heading: number }[] = []

    for (const bot of aliveBots) {
      if (!bot.bot_behavior) continue

      const target = getBotMoveTarget({
        bot,
        behavior:     bot.bot_behavior,
        humanPlayers,
        allPlayers:   ps,
        objectives:   objs,
        fieldCenter:  center,
        fieldRadiusM,
      })

      const speedMps = BOT_SPEED_MPS[diff]
      const move     = stepToward(
        { lat: bot.lat!, lng: bot.lng! },
        target,
        speedMps,
        dtSec,
      )
      moves.push({ botId: bot.id, ...move })
    }

    if (moves.length > 0) {
      updateBotPositions({ gameId, controllerId, deviceId, moves }).catch(() => {})
    }

    // ── 4. 近接攻撃チェック ─────────────────────────────────────────────
    const accuracy   = BOT_ACCURACY[diff]
    const cooldownMs = BOT_SHOOT_COOLDOWN_MS[diff]

    for (const bot of aliveBots) {
      // spy_bot と roamer/rusher のみ攻撃（crew_bot は攻撃しない）
      if (bot.bot_behavior === 'crew_bot' || bot.bot_behavior === 'defender') continue

      const lastShotMs = bot.last_shot_at ? new Date(bot.last_shot_at).getTime() : 0
      const attackTarget = getBotAttackTarget({
        bot,
        humanPlayers,
        lastShotAt:  lastShotMs,
        cooldownMs,
        accuracy,
        now,
      })
      if (!attackTarget) continue

      botAttack({
        gameId, controllerId, deviceId,
        botId:    bot.id,
        targetId: attackTarget.id,
      }).catch(() => {})
    }
  }, [gameId, gameMode, fieldRadiusM])

  useEffect(() => {
    if (!enabled || !isController) return
    tick()
    const id = setInterval(tick, BOT_MOVE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [enabled, isController, tick])
}
