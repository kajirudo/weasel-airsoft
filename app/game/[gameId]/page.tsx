'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { CameraView }          from '@/components/game/CameraView'
import { HpOverlay }           from '@/components/game/HpOverlay'
import { HitFlash }            from '@/components/game/HitFlash'
import { ConnectionWarning }   from '@/components/game/ConnectionWarning'
import { SpectatorView }       from '@/components/game/SpectatorView'
import { TimerDisplay }        from '@/components/game/TimerDisplay'
import { CountdownOverlay }    from '@/components/game/CountdownOverlay'
import { KillFeed, useKillFeed } from '@/components/game/KillFeed'
import { ChatPanel }           from '@/components/game/ChatPanel'
import { Button }              from '@/components/ui/Button'
import { ShareGameId }         from '@/components/lobby/ShareGameId'
import { GameSettings }        from '@/components/lobby/GameSettings'
import { usePlayerRealtime }   from '@/hooks/usePlayerRealtime'
import { useGameRealtime }     from '@/hooks/useGameRealtime'
import { useHitEffect }        from '@/hooks/useHitEffect'
import { useWakeLock }         from '@/hooks/useWakeLock'
import { useHeartbeat }        from '@/hooks/useHeartbeat'
import { useSound }            from '@/hooks/useSound'
import { useGameTimer }        from '@/hooks/useGameTimer'
import { useCountdown }        from '@/hooks/useCountdown'
import { useGameChat }         from '@/hooks/useGameChat'
import { registerHit, startGame, finishGameByTimeout } from '@/lib/game/actions'
import { MAX_HP, HIT_DAMAGE }  from '@/lib/game/constants'
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
    hitDamage:       HIT_DAMAGE,
    shootCooldown:   DEFAULT_SHOOT_COOLDOWN,
    durationMinutes: 0,
    teamMode:        false,
  })
  const lastShotRef = useRef(0)

  useWakeLock()

  const { isFlashing, triggerFlash }              = useHitEffect()
  const { playShot, playHit, playKill, playTimeout } = useSound()
  const { events: killEvents, addKill }           = useKillFeed()

  // キル通知コールバック（usePlayerRealtime へ渡す）
  const handleKill = useCallback((victimName: string, killerName: string) => {
    addKill(victimName, killerName)
  }, [addKill])

  // HP変化コールバック
  const handleHpChange = useCallback(
    (playerId: string, _newHp: number, _oldHp: number) => {
      if (session && playerId === session.playerId) { triggerFlash(); playHit() }
    },
    [session, triggerFlash, playHit]
  )

  const { players, realtimeStatus: playerStatus } =
    usePlayerRealtime(gameId, handleHpChange, handleKill)
  const { game, realtimeStatus: gameStatus }      = useGameRealtime(gameId)

  useHeartbeat({
    gameId,
    playerId:   session?.playerId,
    deviceId:   session?.deviceId,
    gameStatus: game?.status,
  })

  // カウントダウン
  const { phase: cdPhase, count: cdCount, isBlock: cdBlock } = useCountdown(game?.status)

  // チャット
  const {
    messages: chatMessages, unreadCount, isPanelOpen,
    openPanel, closePanel, sendStamp,
  } = useGameChat(gameId, session?.name)

  // 接続状態の統合
  const worstStatus = (() => {
    const order = { error: 0, reconnecting: 1, connecting: 2, connected: 3 } as const
    return order[playerStatus] <= order[gameStatus] ? playerStatus : gameStatus
  })()
  const isOffline = worstStatus !== 'connected'

  // セッション復元
  useEffect(() => {
    const raw = sessionStorage.getItem('weasel_session')
    if (!raw) { router.replace('/lobby'); return }
    const s: LocalPlayerSession = JSON.parse(raw)
    if (s.gameId !== gameId) { router.replace('/lobby'); return }
    setSession(s)
  }, [gameId, router])

  // タイマー
  const isHostRef = useRef(false)
  const selfPlayer: Player | undefined = players.find((p) => p.id === session?.playerId)
  const isHost     = players.length > 0 && players[0].id === session?.playerId
  isHostRef.current = isHost

  const { remainingSeconds } = useGameTimer({
    startedAt:       game?.started_at ?? null,
    durationMinutes: game?.duration_minutes ?? 0,
    status:          game?.status,
    onExpire: async () => {
      playTimeout()
      if (isHostRef.current) {
        try { await finishGameByTimeout({ gameId }) } catch { /* already finished */ }
      }
    },
  })

  const shootCooldown = game?.shoot_cooldown ?? DEFAULT_SHOOT_COOLDOWN

  // 射撃ハンドラ
  const handleShoot = useCallback(async () => {
    if (!session || !detectedQR?.isInReticle) return
    if (detectedQR.qrCodeId === session.qrCodeId) return
    if (isOffline || cdBlock) return

    const now = Date.now()
    if (now - lastShotRef.current < shootCooldown) return
    lastShotRef.current = now

    try {
      const result = await registerHit({
        gameId,
        shooterPlayerId: session.playerId,
        shooterDeviceId: session.deviceId,
        targetQrCodeId:  detectedQR.qrCodeId,
      })
      if (!result.throttled) {
        result.gameOver ? playKill() : playShot()
      }
    } catch { /* 無視 */ }
  }, [session, detectedQR, gameId, shootCooldown, isOffline, cdBlock, playShot, playKill])

  const handleStartGame = async () => {
    setIsStarting(true)
    try {
      await startGame({
        gameId,
        hitDamage:       balanceSettings.hitDamage,
        shootCooldown:   balanceSettings.shootCooldown,
        durationMinutes: balanceSettings.durationMinutes,
        teamMode:        balanceSettings.teamMode,
      })
    } catch { setIsStarting(false) }
  }

  const isLobby  = game?.status === 'lobby'
  const isActive = game?.status === 'active'
  const isDead   = selfPlayer && !selfPlayer.is_alive

  if (!session) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <p className="text-gray-400">読み込み中...</p>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">

      {/* ─── スペクテイターモード（死亡時） ─────────────────────────────── */}
      {isDead && isActive && selfPlayer ? (
        <SpectatorView players={players} selfPlayer={selfPlayer} />
      ) : (
        <>
          <CameraView
            onQRDetected={setDetectedQR}
            onShoot={handleShoot}
            isInReticle={detectedQR?.isInReticle ?? false}
            offline={isOffline || cdBlock}
          />
          <HitFlash isFlashing={isFlashing} />
          {isActive && <TimerDisplay remainingSeconds={remainingSeconds} />}
          {selfPlayer && <HpOverlay selfPlayer={selfPlayer} allPlayers={players} />}
        </>
      )}

      {/* カウントダウンオーバーレイ（死亡後スペクテイター上にも表示） */}
      <CountdownOverlay phase={cdPhase} count={cdCount} />

      {/* キルフィード */}
      {isActive && <KillFeed events={killEvents} />}

      {/* チャット */}
      {(isActive || (isDead && isActive)) && (
        <ChatPanel
          messages={chatMessages}
          unreadCount={unreadCount}
          isPanelOpen={isPanelOpen}
          onOpen={openPanel}
          onClose={closePanel}
          onSendStamp={sendStamp}
        />
      )}

      {/* 接続状態バナー */}
      <ConnectionWarning status={worstStatus} />

      {/* ─── ロビー中 ────────────────────────────────────────────────────── */}
      {isLobby && (
        <div className="absolute inset-0 flex flex-col items-center gap-3 px-4 pt-4 pb-8 z-10 overflow-y-auto pointer-events-none">
          <div className="w-full max-w-xs pointer-events-auto">
            <ShareGameId gameId={gameId} shortCode={game?.short_code} />
          </div>
          {isHost && (
            <div className="w-full max-w-xs pointer-events-auto">
              <GameSettings {...balanceSettings} onChange={setBalance} />
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

      {/* ─── ゲーム中ヒント ───────────────────────────────────────────────── */}
      {isActive && !isDead && (
        <>
          {detectedQR && !detectedQR.isInReticle && !isOffline && !cdBlock && (
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
