'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { CameraView }       from '@/components/game/CameraView'
import { HpOverlay }        from '@/components/game/HpOverlay'
import { HitFlash }         from '@/components/game/HitFlash'
import { ConnectionWarning } from '@/components/game/ConnectionWarning'
import { Button }           from '@/components/ui/Button'
import { ShareGameId }      from '@/components/lobby/ShareGameId'
import { GameSettings }     from '@/components/lobby/GameSettings'
import { usePlayerRealtime } from '@/hooks/usePlayerRealtime'
import { useGameRealtime }  from '@/hooks/useGameRealtime'
import { useHitEffect }     from '@/hooks/useHitEffect'
import { useWakeLock }      from '@/hooks/useWakeLock'
import { useHeartbeat }     from '@/hooks/useHeartbeat'
import { registerHit, startGame } from '@/lib/game/actions'
import { MAX_HP, HIT_DAMAGE }     from '@/lib/game/constants'
import type { DetectedQR, LocalPlayerSession } from '@/types/game'
import type { Player } from '@/types/database'

const DEFAULT_SHOOT_COOLDOWN = 800

export default function GamePage() {
  const { gameId } = useParams<{ gameId: string }>()
  const router     = useRouter()

  const [session, setSession]         = useState<LocalPlayerSession | null>(null)
  const [detectedQR, setDetectedQR]   = useState<DetectedQR | null>(null)
  const [isStarting, setIsStarting]   = useState(false)
  const [balanceSettings, setBalance] = useState({
    hitDamage:     HIT_DAMAGE,
    shootCooldown: DEFAULT_SHOOT_COOLDOWN,
  })
  const lastShotRef = useRef(0)

  useWakeLock()

  const { isFlashing, triggerFlash } = useHitEffect()

  const handleHpChange = useCallback(
    (playerId: string, _newHp: number, _oldHp: number) => {
      if (session && playerId === session.playerId) triggerFlash()
    },
    [session, triggerFlash]
  )

  const { players, realtimeStatus: playerStatus } = usePlayerRealtime(gameId, handleHpChange)
  const { game,    realtimeStatus: gameStatus   } = useGameRealtime(gameId)

  // ─── ハートビート ───────────────────────────────────────────────────────────
  // 5秒ごとに mark_player_seen RPC を呼び出し、自分の生存を報告。
  // 15秒応答がない他プレイヤーは自動失格（DB側で処理）。
  useHeartbeat({
    gameId,
    playerId:   session?.playerId,
    deviceId:   session?.deviceId,
    gameStatus: game?.status,
  })

  // ─── 接続状態の統合 ─────────────────────────────────────────────────────────
  const worstStatus = (() => {
    const order = { error: 0, reconnecting: 1, connecting: 2, connected: 3 } as const
    return order[playerStatus] <= order[gameStatus] ? playerStatus : gameStatus
  })()
  const isOffline = worstStatus !== 'connected'

  useEffect(() => {
    const raw = sessionStorage.getItem('weasel_session')
    if (!raw) { router.replace('/lobby'); return }
    const s: LocalPlayerSession = JSON.parse(raw)
    if (s.gameId !== gameId) { router.replace('/lobby'); return }
    setSession(s)
  }, [gameId, router])

  const shootCooldown = game?.shoot_cooldown ?? DEFAULT_SHOOT_COOLDOWN

  const handleShoot = useCallback(async () => {
    if (!session || !detectedQR?.isInReticle) return
    if (detectedQR.qrCodeId === session.qrCodeId) return
    if (isOffline) return

    const now = Date.now()
    if (now - lastShotRef.current < shootCooldown) return
    lastShotRef.current = now

    try {
      await registerHit({
        gameId,
        shooterPlayerId: session.playerId,
        shooterDeviceId: session.deviceId,
        targetQrCodeId:  detectedQR.qrCodeId,
      })
    } catch { /* 無視 */ }
  }, [session, detectedQR, gameId, shootCooldown, isOffline])

  const handleStartGame = async () => {
    setIsStarting(true)
    try {
      await startGame({
        gameId,
        hitDamage:     balanceSettings.hitDamage,
        shootCooldown: balanceSettings.shootCooldown,
      })
    } catch {
      setIsStarting(false)
    }
  }

  const selfPlayer: Player | undefined = players.find((p) => p.id === session?.playerId)
  const isHost   = players.length > 0 && players[0].id === session?.playerId
  const isLobby  = game?.status === 'lobby'
  const isActive = game?.status === 'active'

  if (!session) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <p className="text-gray-400">読み込み中...</p>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      {/* カメラ + レティクル（offline 時は × マーク） */}
      <CameraView
        onQRDetected={setDetectedQR}
        onShoot={handleShoot}
        isInReticle={detectedQR?.isInReticle ?? false}
        offline={isOffline}
      />

      <HitFlash isFlashing={isFlashing} />

      {/* 接続状態バナー */}
      <ConnectionWarning status={worstStatus} />

      {selfPlayer && <HpOverlay selfPlayer={selfPlayer} allPlayers={players} />}

      {/* ─── ロビー中 ────────────────────────────────────────────────────── */}
      {isLobby && (
        <div className="absolute inset-0 flex flex-col items-center gap-3 px-4 pt-4 pb-8 z-10 overflow-y-auto pointer-events-none">
          <div className="w-full max-w-xs pointer-events-auto">
            <ShareGameId gameId={gameId} />
          </div>

          {isHost && (
            <div className="w-full max-w-xs pointer-events-auto">
              <GameSettings
                hitDamage={balanceSettings.hitDamage}
                shootCooldown={balanceSettings.shootCooldown}
                onChange={setBalance}
              />
            </div>
          )}

          {isHost && players.length >= 2 && (
            <div className="pointer-events-auto">
              <Button onClick={handleStartGame} loading={isStarting}>
                ゲーム開始 ({players.length}人)
              </Button>
            </div>
          )}
          {isHost && players.length < 2 && (
            <p className="text-gray-300 text-sm bg-black/60 px-3 py-1 rounded-lg pointer-events-none">
              あと{2 - players.length}人参加で開始できます
            </p>
          )}
          {!isHost && (
            <p className="text-gray-300 text-sm bg-black/60 px-3 py-1 rounded-lg pointer-events-none">
              ホストがゲームを開始するまで待機中...
            </p>
          )}
        </div>
      )}

      {/* ─── ゲーム中 ────────────────────────────────────────────────────── */}
      {isActive && (
        <>
          {detectedQR && !detectedQR.isInReticle && !isOffline && (
            <div className="absolute bottom-24 left-0 right-0 flex justify-center pointer-events-none">
              <div className="bg-white/20 text-white text-xs px-3 py-1 rounded-full backdrop-blur-sm">
                QR検出 — 中央に合わせてください
              </div>
            </div>
          )}

          {selfPlayer && selfPlayer.hp > 0 && selfPlayer.hp <= MAX_HP * 0.25 && (
            <div className="absolute bottom-36 left-0 right-0 flex justify-center pointer-events-none animate-pulse">
              <div className="bg-red-600/80 text-white text-xs font-bold px-3 py-1 rounded-full">
                CRITICAL HP
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
