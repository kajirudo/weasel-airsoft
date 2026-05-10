'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { CameraView }            from '@/components/game/CameraView'
import type { CameraViewHandle } from '@/components/game/CameraView'
import { HpOverlay }             from '@/components/game/HpOverlay'
import { HitFlash }              from '@/components/game/HitFlash'
import { ConnectionWarning }     from '@/components/game/ConnectionWarning'
import { SpectatorView }         from '@/components/game/SpectatorView'
import { TimerDisplay }          from '@/components/game/TimerDisplay'
import { CountdownOverlay }      from '@/components/game/CountdownOverlay'
import { KillFeed, useKillFeed } from '@/components/game/KillFeed'
import { ChatPanel }             from '@/components/game/ChatPanel'
import { KillcamOverlay }        from '@/components/game/KillcamOverlay'
import { Button }                from '@/components/ui/Button'
import { ShareGameId }           from '@/components/lobby/ShareGameId'
import { GameSettings }          from '@/components/lobby/GameSettings'
import { usePlayerRealtime }     from '@/hooks/usePlayerRealtime'
import { useGameRealtime }       from '@/hooks/useGameRealtime'
import { useHitEffect }          from '@/hooks/useHitEffect'
import { useWakeLock }           from '@/hooks/useWakeLock'
import { useHeartbeat }          from '@/hooks/useHeartbeat'
import { useSound }              from '@/hooks/useSound'
import { useGameTimer }          from '@/hooks/useGameTimer'
import { useCountdown }          from '@/hooks/useCountdown'
import { useGameChat }           from '@/hooks/useGameChat'
import { useKillcam }            from '@/hooks/useKillcam'
import { registerHit, startGame, finishGameByTimeout, uploadKillcam } from '@/lib/game/actions'
import { compositeKillcam }      from '@/lib/game/killcam-capture'
import { MAX_HP, HIT_DAMAGE, STICKY_GRACE_MS, AUTO_FIRE_HOLD_MS } from '@/lib/game/constants'
import type { DetectedQR, LocalPlayerSession } from '@/types/game'
import type { Player, QrCodeId } from '@/types/database'

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

  // ── オートファイア / スティッキー検知 ──────────────────────────────────────
  const [autoFireEnabled, setAutoFireEnabled] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('weasel_autofire') !== 'false'
  })
  const [stickyInReticle, setStickyInReticle] = useState(false)
  // チャージリングのアニメーションを再起動するキー（ターゲットが変わるたびに変わる）
  const [chargeKey, setChargeKey] = useState(0)
  const lastTargetQRIdRef  = useRef<QrCodeId | null>(null)
  const handleShootRef     = useRef<() => void>(() => {})
  const gamepadRafRef      = useRef<number>(0)
  // CameraView への ref（captureFrame() 公開）
  const cameraViewRef      = useRef<CameraViewHandle>(null)
  // killcam 合成+送信ロジック（最新の players/session を参照するため ref で保持）
  const captureKillcamRef  = useRef<(targetQrCodeId: QrCodeId) => void>(() => {})
  // players を ref でも保持（useCallback の stale closure を避けるため）
  const playersRef         = useRef<Player[]>([])

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

  // playersRef を最新状態に同期（captureKillcamRef 内で stale closure を避けるため）
  useEffect(() => { playersRef.current = players }, [players])

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

  // Kill Cam（受信 + 送信チャンネル）
  const { killcam, dismiss: dismissKillcam, sendKillcam } = useKillcam(gameId, session?.playerId)

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

  // ── 射撃コア（ID指定） ────────────────────────────────────────────────────
  const shootTarget = useCallback(async (targetQrCodeId: QrCodeId) => {
    if (!session) return
    if (targetQrCodeId === session.qrCodeId) return
    if (isOffline || cdBlock || game?.status !== 'active') return

    const now = Date.now()
    if (now - lastShotRef.current < shootCooldown) return
    lastShotRef.current = now

    try {
      const result = await registerHit({
        gameId,
        shooterPlayerId: session.playerId,
        shooterDeviceId: session.deviceId,
        targetQrCodeId,
      })
      if (!result.throttled) {
        result.gameOver ? playKill() : playShot()
        // キルカム: ヒットが確定したら非同期でキャプチャ＆配信（エラーは無視）
        captureKillcamRef.current(targetQrCodeId)
      }
    } catch { /* 無視 */ }
  }, [session, gameId, shootCooldown, isOffline, cdBlock, game?.status, playShot, playKill])

  // マニュアル射撃（タップ）— レティクル内に QR が映っているときのみ
  const handleShoot = useCallback(async () => {
    if (!detectedQR?.isInReticle) return
    await shootTarget(detectedQR.qrCodeId)
  }, [detectedQR, shootTarget])

  // スティッキー射撃（オートファイア / BT トリガー用）— lastTargetQRIdRef が有効なら射撃
  const handleShootSticky = useCallback(async () => {
    const qrId = lastTargetQRIdRef.current
    if (!qrId) return
    await shootTarget(qrId)
  }, [shootTarget])

  // handleShootRef を最新の handleShootSticky に同期
  useEffect(() => { handleShootRef.current = handleShootSticky }, [handleShootSticky])

  // ── captureKillcamRef: 常に最新の players/session/sendKillcam を参照 ──────
  useEffect(() => {
    captureKillcamRef.current = async (targetQrCodeId: QrCodeId) => {
      if (!session) return

      // カメラフレームをキャプチャ
      const snap = cameraViewRef.current?.captureFrame()
      if (!snap) return

      // 対象プレイヤーを特定
      const targetPlayer = playersRef.current.find((p) => p.qr_code_id === targetQrCodeId)
      if (!targetPlayer) return

      try {
        // オーバーレイを合成して JPEG に変換
        const blob = await compositeKillcam(snap, {
          shooterName: session.name,
          timestamp:   new Date(),
        })

        // Server Action でストレージにアップロード
        const fd = new FormData()
        fd.set('file',           new File([blob], 'killcam.jpg', { type: 'image/jpeg' }))
        fd.set('gameId',         gameId)
        fd.set('targetPlayerId', targetPlayer.id)
        const imageUrl = await uploadKillcam(fd)

        // Broadcast で対象プレイヤーに配信
        await sendKillcam({
          imageUrl,
          shooterName:    session.name,
          timestamp:      new Date().toISOString(),
          targetPlayerId: targetPlayer.id,
        })
      } catch {
        // キルカムの失敗はゲームプレイに影響しないため無視
      }
    }
  }, [session, gameId, sendKillcam])

  // ── スティッキー検知 ────────────────────────────────────────────────────
  useEffect(() => {
    const isIn = detectedQR?.isInReticle ?? false
    const qrId = detectedQR?.qrCodeId ?? null

    if (isIn && qrId) {
      if (qrId !== lastTargetQRIdRef.current) {
        // 新しいターゲット取得 → チャージアニメーションをリセット
        lastTargetQRIdRef.current = qrId as QrCodeId
        setChargeKey((k) => k + 1)
      }
      setStickyInReticle(true)
      return
    }

    // QR がレティクルを外れた → グレース期間後に解除
    const timer = window.setTimeout(() => {
      setStickyInReticle(false)
      lastTargetQRIdRef.current = null
    }, STICKY_GRACE_MS)
    return () => clearTimeout(timer)
  }, [detectedQR?.isInReticle, detectedQR?.qrCodeId])

  // ── オートファイア ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!autoFireEnabled || !stickyInReticle) return
    // AUTO_FIRE_HOLD_MS ごとに射撃を試みる（実際の発射はクールダウンで制御）
    const interval = window.setInterval(() => {
      handleShootRef.current()
    }, AUTO_FIRE_HOLD_MS)
    return () => clearInterval(interval)
  }, [stickyInReticle, autoFireEnabled])

  // ── Bluetooth トリガー: キーボードイベント ────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // BT カメラリモコンは Space/Enter/VolumeUp を送信することが多い
      if (['Space', 'Enter', 'VolumeUp', 'AudioVolumeUp'].includes(e.code)) {
        e.preventDefault()
        handleShootRef.current()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // ── Bluetooth トリガー: Gamepad API ──────────────────────────────────────
  useEffect(() => {
    const prevPressed = new Map<string, boolean>()

    const poll = () => {
      const pads = navigator.getGamepads?.() ?? []
      for (const pad of pads) {
        if (!pad) continue
        pad.buttons.forEach((btn, idx) => {
          const key  = `${pad.index}-${idx}`
          const was  = prevPressed.get(key) ?? false
          const now  = btn.pressed
          prevPressed.set(key, now)
          if (now && !was) handleShootRef.current()   // エッジ検出（押した瞬間のみ）
        })
      }
      gamepadRafRef.current = requestAnimationFrame(poll)
    }

    gamepadRafRef.current = requestAnimationFrame(poll)
    return () => cancelAnimationFrame(gamepadRafRef.current)
  }, [])

  // オートファイアの設定を localStorage に保存
  useEffect(() => {
    localStorage.setItem('weasel_autofire', String(autoFireEnabled))
  }, [autoFireEnabled])

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
            ref={cameraViewRef}
            onQRDetected={setDetectedQR}
            onShoot={handleShoot}
            isInReticle={stickyInReticle}
            offline={isOffline || cdBlock}
          />
          <HitFlash isFlashing={isFlashing} />
          {isActive && <TimerDisplay remainingSeconds={remainingSeconds} />}
          {selfPlayer && <HpOverlay selfPlayer={selfPlayer} allPlayers={players} />}

          {/* ─── チャージリング（オートファイア中） ──────────────────────── */}
          {isActive && autoFireEnabled && stickyInReticle && !isOffline && !cdBlock && (
            <div
              key={chargeKey}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <svg width="160" height="160" viewBox="0 0 160 160">
                <circle
                  cx="80" cy="80" r="72"
                  fill="none"
                  stroke="rgba(255,255,255,0.15)"
                  strokeWidth="4"
                />
                <circle
                  cx="80" cy="80" r="72"
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray="452"
                  strokeDashoffset="452"
                  transform="rotate(-90 80 80)"
                  style={{
                    animation: `charge-fill ${AUTO_FIRE_HOLD_MS}ms linear infinite`,
                  }}
                />
              </svg>
              <style>{`
                @keyframes charge-fill {
                  from { stroke-dashoffset: 452; }
                  to   { stroke-dashoffset: 0;   }
                }
              `}</style>
            </div>
          )}
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
          {/* QR検出中だがレティクル外のヒント */}
          {detectedQR && !stickyInReticle && !isOffline && !cdBlock && (
            <div className="absolute bottom-24 left-0 right-0 flex justify-center pointer-events-none">
              <div className="bg-white/20 text-white text-xs px-3 py-1 rounded-full backdrop-blur-sm">
                QR検出 — 中央に合わせてください
              </div>
            </div>
          )}

          {/* クリティカル HP 警告 */}
          {selfPlayer && selfPlayer.hp > 0 && selfPlayer.hp <= MAX_HP * 0.25 && (
            <div className="absolute bottom-36 left-0 right-0 flex justify-center pointer-events-none animate-pulse">
              <div className="bg-red-600/80 text-white text-xs font-bold px-3 py-1 rounded-full">
                CRITICAL HP
              </div>
            </div>
          )}

          {/* AUTO / MANUAL トグル */}
          <div className="absolute top-4 right-4 pointer-events-auto">
            <button
              onClick={() => setAutoFireEnabled((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                autoFireEnabled
                  ? 'bg-red-600/80 border-red-500 text-white'
                  : 'bg-black/60 border-gray-600 text-gray-400'
              }`}
            >
              <span>{autoFireEnabled ? '🔴' : '⚪'}</span>
              {autoFireEnabled ? 'AUTO' : 'MANUAL'}
            </button>
          </div>
        </>
      )}

      {/* ─── Kill Cam オーバーレイ（自分が撃たれたとき） ─────────────────── */}
      {killcam && (
        <KillcamOverlay data={killcam} onDismiss={dismissKillcam} />
      )}
    </div>
  )
}
