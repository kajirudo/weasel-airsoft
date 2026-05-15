'use client'

/**
 * ObjectiveAlert — 近接オブジェクト操作 UI
 *
 * - 近くにアイテム/発電機/拠点があるとき画面下部に操作ボタンを表示
 * - 発電機・拠点は「ホールドボタン」で Hold タイマー付き操作
 * - アイテムはタップで即時獲得
 * - 拠点: 相手チームが占領中は警告表示 / 同チーム複数人で速度2倍バッジ
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  claimObjective,
  beginGenerator,
  completeGenerator,
  cancelGenerator,
  beginCapture,
  completeCapture,
  cancelCapture,
} from '@/lib/game/actions'
import { completeMission } from '@/lib/game/traitorActions'
import { checkSealVictory } from '@/lib/game/npcActions'
import { GENERATOR_HOLD_MS, CAPTURE_HOLD_MS } from '@/lib/game/constants'
import { HoldButton } from '@/components/game/HoldButton'
import type { NearbyObjectives, ObjectiveWithDist } from '@/hooks/useObjectives'
import type { LocalPlayerSession } from '@/types/game'

interface Props {
  nearby:    NearbyObjectives
  session:   LocalPlayerSession | null
  gameId:    string
  team:      'red' | 'blue' | 'none'
  /** traitor モードかどうか（発電機完了時に completeMission を呼ぶ） */
  isTraitorMode?: boolean
  /** hunting モードかどうか（封印QR スキャン完了時に checkSealVictory を呼ぶ） */
  isHuntingMode?: boolean
  /** 占領完了時に呼ばれるコールバック（サウンド再生用） */
  onCaptureDone?: () => void
  /** 発電機起動完了時に呼ばれるコールバック */
  onGeneratorDone?: () => void
}

// ── メインコンポーネント ────────────────────────────────────────────────────────
export function ObjectiveAlert({
  nearby, session, gameId, team,
  isTraitorMode, isHuntingMode, onCaptureDone, onGeneratorDone,
}: Props) {
  const [busy,    setBusy]    = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => setMessage(null), 3000)
    return () => clearTimeout(t)
  }, [message])

  // ── アイテム獲得 ──────────────────────────────────────────────────────────
  const handleClaim = useCallback(async (obj: ObjectiveWithDist) => {
    if (!session || busy) return
    setBusy(true)
    try {
      const result = await claimObjective({
        objectiveId: obj.id, playerId: session.playerId,
        deviceId: session.deviceId, gameId,
      })
      if (result.effect === 'medkit')        setMessage(`💊 回復！ HP → ${result.newHp}`)
      else if (result.effect === 'damage_boost') setMessage('⚡ ダメージブースト獲得！次の射撃が2倍')
    } catch (e: unknown) {
      setMessage(`❌ ${e instanceof Error ? e.message : 'エラー'}`)
    } finally { setBusy(false) }
  }, [session, busy, gameId])

  // ── 発電機ホールド ────────────────────────────────────────────────────────
  const genRef = useRef<ObjectiveWithDist | null>(null)

  const handleGenStart = useCallback(async (obj: ObjectiveWithDist) => {
    if (!session) return
    genRef.current = obj
    try {
      await beginGenerator({
        objectiveId: obj.id, playerId: session.playerId,
        deviceId: session.deviceId, gameId,
      })
    } catch (e: unknown) {
      setMessage(`❌ ${e instanceof Error ? e.message : 'エラー'}`)
    }
  }, [session, gameId])

  const handleGenComplete = useCallback(async () => {
    const obj = genRef.current
    if (!session || !obj) return
    try {
      if (isTraitorMode) {
        // Traitor モード: task_done をインクリメントして Crew 勝利を判定
        const { taskDone, taskGoal, crewWins } = await completeMission({
          objectiveId: obj.id, playerId: session.playerId,
          deviceId: session.deviceId, gameId,
        })
        onGeneratorDone?.()
        setMessage(crewWins
          ? `🔋 全タスク完了（${taskDone}/${taskGoal}）！Crew 勝利！`
          : `🔋 タスク完了（${taskDone}/${taskGoal}）`)
      } else {
        const { allActivated } = await completeGenerator({
          objectiveId: obj.id, playerId: session.playerId,
          deviceId: session.deviceId, gameId,
        })
        onGeneratorDone?.()
        setMessage(allActivated ? '🔋 全発電機起動！Survivor 勝利！' : '🔋 発電機起動！')
      }
    } catch (e: unknown) {
      setMessage(`❌ ${e instanceof Error ? e.message : 'エラー'}`)
    }
  }, [session, gameId, isTraitorMode, onGeneratorDone])

  const handleGenCancel = useCallback(async () => {
    const obj = genRef.current
    if (!session || !obj) return
    try {
      await cancelGenerator({ objectiveId: obj.id, playerId: session.playerId, gameId })
    } catch { /* 無視 */ }
  }, [session, gameId])

  // ── 拠点占領ホールド ──────────────────────────────────────────────────────
  const cpRef = useRef<ObjectiveWithDist | null>(null)

  const handleCpStart = useCallback(async (obj: ObjectiveWithDist) => {
    if (!session || team === 'none') return
    cpRef.current = obj
    try {
      await beginCapture({
        objectiveId: obj.id, playerId: session.playerId,
        deviceId: session.deviceId, gameId,
        capturingTeam: team as 'red' | 'blue',
      })
    } catch (e: unknown) {
      setMessage(`❌ ${e instanceof Error ? e.message : 'エラー'}`)
    }
  }, [session, gameId, team])

  const handleCpComplete = useCallback(async () => {
    const obj = cpRef.current
    if (!session || !obj || team === 'none') return
    try {
      await completeCapture({
        objectiveId: obj.id, playerId: session.playerId,
        deviceId: session.deviceId, gameId,
        capturingTeam: team as 'red' | 'blue',
      })
      onCaptureDone?.()
      setMessage('🏴 拠点を占領！')
    } catch (e: unknown) {
      setMessage(`❌ ${e instanceof Error ? e.message : 'エラー'}`)
    }
  }, [session, gameId, team, onCaptureDone])

  const handleCpCancel = useCallback(async () => {
    const obj = cpRef.current
    if (!session || !obj) return
    try {
      await cancelCapture({ objectiveId: obj.id, playerId: session.playerId, gameId })
    } catch { /* 無視 */ }
  }, [session, gameId])

  // ── 封印QR スキャン（hunting モード）────────────────────────────────────
  const sealRef = useRef<ObjectiveWithDist | null>(null)

  const handleSealStart = useCallback(async (obj: ObjectiveWithDist) => {
    if (!session) return
    sealRef.current = obj
  }, [session])

  const handleSealComplete = useCallback(async () => {
    const obj = sealRef.current
    if (!session || !obj) return
    try {
      // claim と同じ仕組みで封印済みにする
      await claimObjective({
        objectiveId: obj.id, playerId: session.playerId,
        deviceId: session.deviceId, gameId,
      })
      // 全封印完了チェック → 勝利判定
      const { allSealed } = await checkSealVictory({ gameId })
      setMessage(allSealed
        ? '🔏 全封印完了！プレイヤーの勝利！'
        : `🔏 封印 ${obj.seal_index ?? '?'} スキャン完了！`)
      onGeneratorDone?.()
    } catch (e: unknown) {
      setMessage(`❌ ${e instanceof Error ? e.message : 'エラー'}`)
    }
  }, [session, gameId, onGeneratorDone])

  const handleSealCancel = useCallback(() => {
    sealRef.current = null
  }, [])

  const hasAny = (
    nearby.items.length > 0 ||
    nearby.generators.length > 0 ||
    nearby.controlPoints.length > 0 ||
    nearby.seals.length > 0
  )
  if (!hasAny && !message) return null

  const firstItem = nearby.items[0]
  const firstGen  = nearby.generators[0]
  const firstCp   = nearby.controlPoints[0]
  const firstSeal = nearby.seals[0]

  const teamColor = team === 'red' ? '#ef4444' : team === 'blue' ? '#3b82f6' : '#6b7280'

  // 拠点の状態
  const enemyCapturing = firstCp?.capturing_team != null &&
                         firstCp.capturing_team !== team
  const alreadyOurs    = firstCp?.controlled_by === team
  const needsCapture   = firstCp && team !== 'none' && !alreadyOurs

  // 人数ボーナス (nearbyTeamCount は page.tsx から注入)
  const cpTeamCount   = firstCp?.nearbyTeamCount ?? 1
  const captureHoldMs = Math.ceil(CAPTURE_HOLD_MS / Math.min(cpTeamCount, 2))
  const bonusBadge    = cpTeamCount >= 2 ? '2× SPEED' : undefined

  return (
    <div className="pointer-events-none fixed bottom-24 left-0 right-0 z-30 flex flex-col items-center gap-2 px-4">
      {/* フィードバックメッセージ */}
      {message && (
        <div className="rounded-xl bg-black/80 px-4 py-2 text-sm font-bold text-white">
          {message}
        </div>
      )}

      {/* 相手チームが占領中の警告 */}
      {enemyCapturing && (
        <div
          className="rounded-xl px-3 py-1.5 text-xs font-bold text-white"
          style={{
            background: firstCp?.capturing_team === 'red' ? 'rgba(239,68,68,0.85)' : 'rgba(59,130,246,0.85)',
            animation: 'cp-pulse 0.8s ease-in-out infinite alternate',
          }}
        >
          ⚠️ {firstCp?.capturing_team === 'red' ? '🔴 RED' : '🔵 BLUE'} が占領中！
        </div>
      )}

      {/* すでに自チームが制圧済みバッジ */}
      {alreadyOurs && firstCp && (
        <div
          className="rounded-xl px-3 py-1.5 text-xs font-bold text-white"
          style={{ background: teamColor, opacity: 0.8 }}
        >
          ✅ 制圧済み
        </div>
      )}

      <div className="pointer-events-auto flex flex-wrap justify-center gap-2">
        {/* アイテム獲得ボタン */}
        {firstItem && (
          <button
            disabled={busy}
            onClick={() => handleClaim(firstItem)}
            className="rounded-xl px-4 py-3 text-sm font-bold text-white"
            style={{
              background: firstItem.type === 'medkit' ? '#22c55e' : '#f59e0b',
              opacity: busy ? 0.4 : 1,
            }}
          >
            {firstItem.type === 'medkit'
              ? `💊 回復 (${firstItem.distM != null ? Math.round(firstItem.distM) + 'm' : '--'})`
              : `⚡ ブースト (${firstItem.distM != null ? Math.round(firstItem.distM) + 'm' : '--'})`}
          </button>
        )}

        {/* 発電機ホールドボタン */}
        {firstGen && (
          <HoldButton
            label={`🔋 発電機起動 (${firstGen.distM != null ? Math.round(firstGen.distM) + 'm' : '--'})`}
            holdMs={GENERATOR_HOLD_MS}
            color="#6366f1"
            onHoldStart={() => handleGenStart(firstGen)}
            onHoldComplete={handleGenComplete}
            onHoldCancel={handleGenCancel}
          />
        )}

        {/* 拠点占領ホールドボタン */}
        {needsCapture && (
          <HoldButton
            label={`🏴 占領 (${firstCp.distM != null ? Math.round(firstCp.distM) + 'm' : '--'})`}
            holdMs={captureHoldMs}
            color={teamColor}
            pulsing={!!enemyCapturing}
            bonusBadge={bonusBadge}
            onHoldStart={() => handleCpStart(firstCp)}
            onHoldComplete={handleCpComplete}
            onHoldCancel={handleCpCancel}
          />
        )}

        {/* 封印QR スキャン（hunting モード） */}
        {isHuntingMode && firstSeal && (
          <HoldButton
            label={`🔏 封印 ${firstSeal.seal_index ?? '?'} スキャン (${firstSeal.distM != null ? Math.round(firstSeal.distM) + 'm' : '--'})`}
            holdMs={GENERATOR_HOLD_MS}
            color="#8b5cf6"
            onHoldStart={() => handleSealStart(firstSeal)}
            onHoldComplete={handleSealComplete}
            onHoldCancel={handleSealCancel}
          />
        )}
      </div>

      <style>{`
        @keyframes cp-pulse {
          from { opacity: 0.75; transform: scale(1);    }
          to   { opacity: 1;    transform: scale(1.03); }
        }
      `}</style>
    </div>
  )
}
