'use client'

import { useState, useRef, useEffect } from 'react'
import type { Player } from '@/types/database'
import { SABOTAGE_DURATION_MS, INVESTIGATE_RADIUS_M } from '@/lib/game/constants'

interface Props {
  selfPlayer:         Player | undefined
  sabotageUntil:      string | null  // game.sabotage_until
  /** GPS 最近接プレイヤー（位置情報あり） */
  nearestCrewDist:    number | null
  nearestCrewId:      string | null
  /** QR スキャン経由の最近接プレイヤー（GPS なし代替） */
  detectedQRPlayerId: string | null
  onSabotage:         () => Promise<void>
  onInvestigate:      (targetId: string) => Promise<{ role2: string }>
}

const SABOTAGE_COOLDOWN_MS = 30_000

export function SpecialRoleHUD({
  selfPlayer, sabotageUntil,
  nearestCrewDist, nearestCrewId,
  detectedQRPlayerId,
  onSabotage, onInvestigate,
}: Props) {
  const role2 = selfPlayer?.role2
  if (!role2 || (role2 !== 'traitor' && role2 !== 'sheriff')) return null
  if (!selfPlayer?.is_alive) return null

  return (
    <div className="fixed bottom-32 right-4 z-[70] flex flex-col gap-2 items-end">
      {role2 === 'traitor' && (
        <TraitorButtons
          selfPlayer={selfPlayer}
          sabotageUntil={sabotageUntil}
          onSabotage={onSabotage}
        />
      )}
      {role2 === 'sheriff' && (
        <SheriffButtons
          selfPlayer={selfPlayer}
          nearestCrewDist={nearestCrewDist}
          nearestCrewId={nearestCrewId}
          detectedQRPlayerId={detectedQRPlayerId}
          onInvestigate={onInvestigate}
        />
      )}
    </div>
  )
}

// ── Traitor ボタン ────────────────────────────────────────────────────────────

function TraitorButtons({
  selfPlayer, sabotageUntil, onSabotage,
}: {
  selfPlayer:    Player
  sabotageUntil: string | null
  onSabotage:    () => Promise<void>
}) {
  const [loading, setLoading] = useState(false)
  const [localCooldownUntil, setLocalCooldownUntil] = useState<number | null>(null)

  // グローバルサボタージュ継続中 or ローカルクールダウン中
  const sabotageActive = sabotageUntil ? new Date(sabotageUntil).getTime() > Date.now() : false
  const onCooldown     = localCooldownUntil ? localCooldownUntil > Date.now() : false
  const disabled       = sabotageActive || onCooldown || loading

  const [cooldownPct, setCooldownPct] = useState(0)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (!localCooldownUntil) { setCooldownPct(0); return }
    const animate = () => {
      const remaining = localCooldownUntil - Date.now()
      if (remaining <= 0) { setCooldownPct(0); return }
      setCooldownPct(Math.min(100, (1 - remaining / SABOTAGE_COOLDOWN_MS) * 100))
      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [localCooldownUntil])

  const handleSabotage = async () => {
    if (disabled) return
    setLoading(true)
    try {
      await onSabotage()
      setLocalCooldownUntil(Date.now() + SABOTAGE_COOLDOWN_MS)
    } catch { /* ignore */ }
    setLoading(false)
  }

  return (
    <button
      onPointerDown={handleSabotage}
      disabled={disabled}
      className="relative w-16 h-16 rounded-full font-bold text-white shadow-lg overflow-hidden disabled:opacity-50 transition"
      style={{ backgroundColor: '#ef4444' }}
    >
      {/* クールダウンオーバーレイ */}
      {cooldownPct > 0 && (
        <div
          className="absolute inset-0 bg-black/50 rounded-full"
          style={{ clipPath: `inset(${cooldownPct}% 0 0 0)` }}
        />
      )}
      <span className="relative text-xl">📡</span>
      <span className="relative text-[10px] block leading-tight">妨害</span>
    </button>
  )
}

// ── Sheriff ボタン ────────────────────────────────────────────────────────────

function SheriffButtons({
  selfPlayer, nearestCrewDist, nearestCrewId, detectedQRPlayerId, onInvestigate,
}: {
  selfPlayer:         Player
  nearestCrewDist:    number | null
  nearestCrewId:      string | null
  /** レティクル内の QR から特定したプレイヤー ID（GPS 代替手段） */
  detectedQRPlayerId: string | null
  onInvestigate:      (targetId: string) => Promise<{ role2: string }>
}) {
  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState<string | null>(null)
  const usesLeft = selfPlayer.investigate_uses

  // 調査方法の決定: GPS 優先、フォールバックとして QR スキャン
  const gpsReady = nearestCrewId !== null && nearestCrewDist !== null && nearestCrewDist <= INVESTIGATE_RADIUS_M
  const qrReady  = detectedQRPlayerId !== null
  const investigateTargetId = gpsReady ? nearestCrewId : (qrReady ? detectedQRPlayerId : null)
  const investigateMode: 'gps' | 'qr' | null =
    gpsReady ? 'gps' : (qrReady ? 'qr' : null)

  const canInvestigate = usesLeft > 0 && investigateTargetId !== null && !loading

  const handleInvestigate = async () => {
    if (!canInvestigate || !investigateTargetId) return
    setLoading(true)
    setResult(null)
    try {
      const { role2 } = await onInvestigate(investigateTargetId)
      setResult(role2 === 'traitor' ? '🔴 TRAITOR!' : '🟢 CREW')
      setTimeout(() => setResult(null), 4000)
    } catch { /* ignore */ }
    setLoading(false)
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {/* 調査結果バナー */}
      {result && (
        <div
          className="text-white font-black text-xl px-3 py-1 rounded-lg shadow-lg animate-bounce"
          style={{ backgroundColor: result.includes('TRAITOR') ? '#ef4444' : '#22c55e' }}
        >
          {result}
        </div>
      )}

      {/* GPS モードのステータス */}
      {nearestCrewDist !== null && (
        <p className="text-white/60 text-xs text-right">
          GPS: {Math.round(nearestCrewDist)}m
          {gpsReady ? ' ✓' : ` (${INVESTIGATE_RADIUS_M}m 以内)`}
        </p>
      )}

      {/* GPS なし・QR スキャン中の案内 */}
      {!gpsReady && (
        <p className="text-white/50 text-xs text-right max-w-[120px] leading-tight">
          {qrReady
            ? '📷 QR スキャン中 ✓'
            : 'GPS 圏外: 相手の QR をスキャンして調査'}
        </p>
      )}

      {/* 調査ボタン */}
      <button
        onPointerDown={handleInvestigate}
        disabled={!canInvestigate}
        className="w-16 h-16 rounded-full font-bold text-white shadow-lg disabled:opacity-40 transition active:scale-95"
        style={{ backgroundColor: '#f59e0b' }}
      >
        <span className="text-xl">{investigateMode === 'qr' ? '📷' : '🔍'}</span>
        <span className="block text-[10px] leading-tight">調査 ×{usesLeft}</span>
      </button>
    </div>
  )
}
