'use client'

/**
 * ObjectiveAlert — 近接オブジェクト操作 UI
 *
 * - 近くにアイテム/発電機/拠点があるとき画面下部に操作ボタンを表示
 * - 発電機・拠点は「ホールドボタン」で Hold タイマー付き操作
 * - アイテムはタップで即時獲得
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
import { GENERATOR_HOLD_MS, CAPTURE_HOLD_MS } from '@/lib/game/constants'
import type { NearbyObjectives, ObjectiveWithDist } from '@/hooks/useObjectives'
import type { LocalPlayerSession } from '@/types/game'

interface Props {
  nearby:  NearbyObjectives
  session: LocalPlayerSession | null
  gameId:  string
  team:    'red' | 'blue' | 'none'
}

// ── ホールドボタン ──────────────────────────────────────────────────────────────
interface HoldButtonProps {
  label:      string
  holdMs:     number
  disabled?:  boolean
  onHoldStart:  () => void
  onHoldComplete: () => void
  onHoldCancel:   () => void
  color:      string
}

function HoldButton({
  label, holdMs, disabled,
  onHoldStart, onHoldComplete, onHoldCancel,
  color,
}: HoldButtonProps) {
  const [progress,  setProgress]  = useState(0)   // 0〜1
  const [holding,   setHolding]   = useState(false)
  const startRef  = useRef<number | null>(null)
  const rafRef    = useRef<number | null>(null)
  const completedRef = useRef(false)

  function startHold() {
    if (disabled || holding) return
    setHolding(true)
    completedRef.current = false
    startRef.current = Date.now()
    onHoldStart()

    function tick() {
      const elapsed = Date.now() - (startRef.current ?? Date.now())
      const p = Math.min(1, elapsed / holdMs)
      setProgress(p)
      if (p >= 1 && !completedRef.current) {
        completedRef.current = true
        onHoldComplete()
        setHolding(false)
        setProgress(0)
        return
      }
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  function cancelHold() {
    if (!holding) return
    setHolding(false)
    setProgress(0)
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    startRef.current = null
    if (!completedRef.current) onHoldCancel()
  }

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
  }, [])

  const progressPct = Math.round(progress * 100)

  return (
    <button
      disabled={disabled}
      onPointerDown={startHold}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      className="relative overflow-hidden rounded-xl px-4 py-3 text-sm font-bold text-white select-none touch-none"
      style={{
        background: color,
        opacity: disabled ? 0.4 : 1,
        minWidth: '8rem',
      }}
    >
      {/* プログレスバー */}
      <span
        className="pointer-events-none absolute inset-0 origin-left transition-none"
        style={{
          transform: `scaleX(${progress})`,
          background: 'rgba(255,255,255,0.35)',
        }}
      />
      <span className="relative z-10">
        {holding ? `${progressPct}%` : label}
      </span>
    </button>
  )
}

// ── メインコンポーネント ────────────────────────────────────────────────────────
export function ObjectiveAlert({ nearby, session, gameId, team }: Props) {
  const [busy,    setBusy]    = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // メッセージ自動クリア
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
        objectiveId: obj.id,
        playerId:    session.playerId,
        deviceId:    session.deviceId,
        gameId,
      })
      if (result.effect === 'medkit')       setMessage(`💊 回復！ HP → ${result.newHp}`)
      else if (result.effect === 'damage_boost') setMessage('⚡ ダメージブースト獲得！次の射撃が2倍')
    } catch (e: unknown) {
      setMessage(`❌ ${e instanceof Error ? e.message : 'エラー'}`)
    } finally {
      setBusy(false)
    }
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
      const { allActivated } = await completeGenerator({
        objectiveId: obj.id, playerId: session.playerId,
        deviceId: session.deviceId, gameId,
      })
      setMessage(allActivated ? '🔋 全発電機起動！Survivor 勝利！' : '🔋 発電機起動！')
    } catch (e: unknown) {
      setMessage(`❌ ${e instanceof Error ? e.message : 'エラー'}`)
    }
  }, [session, gameId])

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
      setMessage('🏴 拠点を占領！')
    } catch (e: unknown) {
      setMessage(`❌ ${e instanceof Error ? e.message : 'エラー'}`)
    }
  }, [session, gameId, team])

  const handleCpCancel = useCallback(async () => {
    const obj = cpRef.current
    if (!session || !obj || team === 'none') return
    try {
      await cancelCapture({ objectiveId: obj.id, playerId: session.playerId, gameId })
    } catch { /* 無視 */ }
  }, [session, gameId, team])

  const hasAny = nearby.items.length > 0 || nearby.generators.length > 0 || nearby.controlPoints.length > 0
  if (!hasAny && !message) return null

  const firstItem   = nearby.items[0]
  const firstGen    = nearby.generators[0]
  const firstCp     = nearby.controlPoints[0]

  const teamColor = team === 'red' ? '#ef4444' : team === 'blue' ? '#3b82f6' : '#6b7280'

  return (
    <div className="pointer-events-none fixed bottom-24 left-0 right-0 z-30 flex flex-col items-center gap-2 px-4">
      {/* フィードバックメッセージ */}
      {message && (
        <div className="rounded-xl bg-black/80 px-4 py-2 text-sm font-bold text-white">
          {message}
        </div>
      )}

      <div className="pointer-events-auto flex flex-wrap justify-center gap-2">
        {/* アイテム獲得ボタン */}
        {firstItem && (
          <button
            disabled={busy}
            onClick={() => handleClaim(firstItem)}
            className="rounded-xl px-4 py-3 text-sm font-bold text-white"
            style={{ background: firstItem.type === 'medkit' ? '#22c55e' : '#f59e0b', opacity: busy ? 0.4 : 1 }}
          >
            {firstItem.type === 'medkit'
              ? `💊 回復アイテム取得 (${firstItem.distM != null ? Math.round(firstItem.distM) + 'm' : '--'})`
              : `⚡ ダメージブースト取得 (${firstItem.distM != null ? Math.round(firstItem.distM) + 'm' : '--'})`}
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
        {firstCp && team !== 'none' && (
          <HoldButton
            label={`🏴 拠点占領 (${firstCp.distM != null ? Math.round(firstCp.distM) + 'm' : '--'})`}
            holdMs={CAPTURE_HOLD_MS}
            color={teamColor}
            onHoldStart={() => handleCpStart(firstCp)}
            onHoldComplete={handleCpComplete}
            onHoldCancel={handleCpCancel}
          />
        )}
      </div>
    </div>
  )
}
