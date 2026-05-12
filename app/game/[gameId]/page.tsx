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
import { RadarOverlay }          from '@/components/game/RadarOverlay'
import { StormOverlay }          from '@/components/game/StormOverlay'
import { ObjectiveAlert }        from '@/components/game/ObjectiveAlert'
import { TacticsScore }          from '@/components/game/TacticsScore'
import { RoleReveal }            from '@/components/game/RoleReveal'
import { TaskProgress }          from '@/components/game/TaskProgress'
import { SpecialRoleHUD }        from '@/components/game/SpecialRoleHUD'
import { MeetingOverlay }        from '@/components/game/MeetingOverlay'
import { Button }                from '@/components/ui/Button'
import { ShareGameId }           from '@/components/lobby/ShareGameId'
import { GameSettings, type GameSettingsValues } from '@/components/lobby/GameSettings'
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
import { useRadar }              from '@/hooks/useRadar'
import { useObjectives }         from '@/hooks/useObjectives'
import { useStorm }              from '@/hooks/useStorm'
import { useMeeting }            from '@/hooks/useMeeting'
import {
  registerHit, startGame, finishGameByTimeout, saveKillcamUrl, commitTacticsScore,
  getMyRole, callMeeting, submitVote, resolveMeeting, useSabotage, investigatePlayer,
} from '@/lib/game/actions'
import { isHostPlayer } from '@/lib/game/utils'
import { compositeKillcam }      from '@/lib/game/killcam-capture'
import { createClient }          from '@/lib/supabase/client'
import { MAX_HP, HIT_DAMAGE, STICKY_GRACE_MS, AUTO_FIRE_HOLD_MS, SCORE_COMMIT_MS, INVESTIGATE_RADIUS_M } from '@/lib/game/constants'
import type { DetectedQR, LocalPlayerSession } from '@/types/game'
import type { Player, QrCodeId, MarkerMode, GameMode, PlayerRole2 } from '@/types/database'

const DEFAULT_SHOOT_COOLDOWN = 800

export default function GamePage() {
  const { gameId } = useParams<{ gameId: string }>()
  const router     = useRouter()

  const [session, setSession]         = useState<LocalPlayerSession | null>(null)
  const [detectedQR, setDetectedQR]   = useState<DetectedQR | null>(null)
  const [isStarting, setIsStarting]   = useState(false)
  const [balanceSettings, setBalance] = useState<GameSettingsValues>({
    hitDamage:       HIT_DAMAGE,
    shootCooldown:   DEFAULT_SHOOT_COOLDOWN,
    durationMinutes: 0,
    teamMode:        false,
    markerMode:      'qr' as MarkerMode,
    gameMode:        'battle' as GameMode,
    stormRadiusM:    80,
    stormFinalM:     15,
    fieldRadiusM:    80,
    traitorCount:    1,
    sheriffEnabled:  false,
  })

  // ゲームレコードから markerMode を初期化（game が読み込まれた時点で同期）
  const markerModeSyncedRef = useRef(false)
  const lastShotRef = useRef(0)

  // ── Traitor モード固有の状態 ──────────────────────────────────────────────
  const [myRole2, setMyRole2]               = useState<PlayerRole2 | null>(null)
  const [traitorNames, setTraitorNames]     = useState<string[]>([])
  const [showRoleReveal, setShowRoleReveal] = useState(false)
  const roleRevealDoneRef = useRef(false)
  const [meetingResult, setMeetingResult]   = useState<{
    exileId: string | null; exileRole: string | null; gameOver: boolean; winner: string | null
  } | null>(null)
  const [callingMeeting, setCallingMeeting] = useState(false)

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
  // snap は registerHit 前にキャプチャしたフレームを受け取る
  const captureKillcamRef  = useRef<(targetQrCodeId: QrCodeId, snap: HTMLCanvasElement | null) => void>(() => {})
  // players を ref でも保持（useCallback の stale closure を避けるため）
  const playersRef         = useRef<Player[]>([])

  useWakeLock()

  const { isFlashing, flashColor, triggerFlash, triggerStormFlash } = useHitEffect()
  const { playShot, playHit, playKill, playTimeout,
          playGeneratorAlert, playCaptureDone, playStormDamage } = useSound()
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

  // ゲームレコードの marker_mode を balanceSettings に一度だけ同期
  useEffect(() => {
    if (game?.marker_mode && !markerModeSyncedRef.current) {
      markerModeSyncedRef.current = true
      setBalance((prev) => ({ ...prev, markerMode: game.marker_mode }))
    }
  }, [game?.marker_mode])

  useHeartbeat({
    gameId,
    playerId:   session?.playerId,
    deviceId:   session?.deviceId,
    gameStatus: game?.status,
  })

  // ── Traitor: ゲームが active になったら自分の role2 を取得 ──────────────────
  useEffect(() => {
    if (game?.status !== 'active' || game?.game_mode !== 'traitor') return
    if (!session || roleRevealDoneRef.current) return
    ;(async () => {
      try {
        const result = await getMyRole({ playerId: session.playerId, deviceId: session.deviceId })
        setMyRole2(result.role2)
        // players がロード済みなら名前解決、なければ ID だけ保存して後で解決
        setTraitorNames(
          result.allTraitorIds
            .map(id => players.find(p => p.id === id)?.name ?? id)
            .filter(Boolean),
        )
        setShowRoleReveal(true)
        roleRevealDoneRef.current = true
      } catch { /* ignore */ }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.status, game?.game_mode, session])

  // ミニマップ用 GPS 追跡（ゲーム中のみ有効）
  const { geoPos, gpsAvailable } = useRadar({ session, enabled: game?.status === 'active' || game?.status === 'lobby' })

  // ゲームオブジェクト（サバイバル・タクティクス・バトルモード）
  const { objectives, nearbyObjectives } = useObjectives({
    gameId:  gameId ?? null,
    geoPos,
    enabled: game?.status === 'active',
    onGeneratorActivated: useCallback((allActivated: boolean) => {
      playGeneratorAlert()
      if (allActivated) {
        // 全発電機起動！ — 追加でキル音も重ねる
        setTimeout(() => playKill(), 350)
      }
    }, [playGeneratorAlert, playKill]),
  })

  // ストーム（selfPlayer 宣言前なので selfPlayer は後から渡す — useStorm 内で ref 参照）
  // ※ selfPlayer / nearbyObjectivesWithBonus は line 225 以降に宣言

  // タクティクス: ホストがスコアをコミット（30秒ごと）
  const tacticsCommitRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (game?.status !== 'active' || game?.game_mode !== 'tactics' || !isHostRef.current) return
    tacticsCommitRef.current = setInterval(async () => {
      if (!isHostRef.current) return
      try { await commitTacticsScore({ gameId }) } catch { /* ignore */ }
    }, SCORE_COMMIT_MS)
    return () => {
      if (tacticsCommitRef.current) clearInterval(tacticsCommitRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.status, game?.game_mode, gameId])

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
  const isHost     = isHostPlayer(players, session?.playerId)
  isHostRef.current = isHost

  // ストーム（selfPlayer 確定後に宣言）
  const storm = useStorm({
    game,
    geoPos,
    session,
    selfPlayer,
    enabled:  game?.status === 'active' && game?.game_mode === 'battle',
    onDamage: useCallback(() => {
      triggerStormFlash()
      playStormDamage()
    }, [triggerStormFlash, playStormDamage]),
  })

  // ── 集会（Traitor モード） ────────────────────────────────────────────────
  const meeting = useMeeting({
    game,
    selfPlayer,
    onResolved: useCallback((result: { exileId: string | null; exileRole: string | null; gameOver: boolean; winner: string | null }) => {
      setMeetingResult(result)
    }, []),
  })

  // GPS: Sheriff の調査用 最近接プレイヤー（自分以外）
  const { nearestCrewDist, nearestCrewId } = (() => {
    if (!geoPos || !selfPlayer || game?.game_mode !== 'traitor') {
      return { nearestCrewDist: null as number | null, nearestCrewId: null as string | null }
    }
    const mPerDegLat = 111_320
    const mPerDegLng = 111_320 * Math.cos(geoPos.lat * Math.PI / 180)
    let minDist = Infinity
    let minId: string | null = null
    for (const p of players) {
      if (p.id === selfPlayer.id || !p.is_alive || p.lat == null || p.lng == null) continue
      const d = Math.sqrt(
        ((p.lat - geoPos.lat) * mPerDegLat) ** 2 +
        ((p.lng - geoPos.lng) * mPerDegLng) ** 2,
      )
      if (d < minDist) { minDist = d; minId = p.id }
    }
    return {
      nearestCrewDist: minId !== null ? minDist : null,
      nearestCrewId:   minId,
    }
  })()

  // 拠点の nearbyTeamCount を GPS で計算して注入（selfPlayer 確定後）
  const selfTeam = selfPlayer?.team ?? 'none'
  const nearbyObjectivesWithBonus = {
    ...nearbyObjectives,
    controlPoints: nearbyObjectives.controlPoints.map(cp => {
      if (!geoPos || selfTeam === 'none') return cp
      const mPerDegLat = 111_320
      const mPerDegLng = 111_320 * Math.cos(geoPos.lat * Math.PI / 180)
      const count = players.filter(p => {
        if (!p.is_alive || p.team !== selfTeam) return false
        if (p.lat == null || p.lng == null) return false
        const d = Math.sqrt(
          ((p.lat - cp.lat) * mPerDegLat) ** 2 +
          ((p.lng - cp.lng) * mPerDegLng) ** 2,
        )
        return d <= 10  // CAPTURE_RADIUS_M
      }).length
      return { ...cp, nearbyTeamCount: Math.max(1, count) }
    }),
  }

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
    // 集会中は射撃禁止（サーバー側でも弾かれるが、無駄な RPC 呼び出しを防ぐ）
    if (game?.meeting_id) return

    const now = Date.now()
    if (now - lastShotRef.current < shootCooldown) return
    lastShotRef.current = now

    // ① registerHit の前にフレームをキャプチャ（「撃った瞬間」の画像を保証）
    const snap = cameraViewRef.current?.captureFrame() ?? null

    try {
      const result = await registerHit({
        gameId,
        shooterPlayerId: session.playerId,
        shooterDeviceId: session.deviceId,
        targetQrCodeId,
      })
      if (!result.throttled) {
        result.gameOver ? playKill() : playShot()
        // ② ヒット確定後、キャプチャ済み snap を渡して合成・配信（非同期・失敗無視）
        captureKillcamRef.current(targetQrCodeId, snap)
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
  // snap は shootTarget が registerHit 前にキャプチャしたフレームを受け取る
  useEffect(() => {
    captureKillcamRef.current = async (
      targetQrCodeId: QrCodeId,
      snap: HTMLCanvasElement | null,
    ) => {
      if (!session || !snap) return

      // 対象プレイヤーを特定
      const targetPlayer = playersRef.current.find((p) => p.qr_code_id === targetQrCodeId)
      if (!targetPlayer) return

      try {
        // オーバーレイを合成して JPEG Blob に変換
        const blob = await compositeKillcam(snap, {
          shooterName: session.name,
          timestamp:   new Date(),
        })

        // Supabase Storage へブラウザから直接アップロード（Server Action を経由しない）
        const supabase = createClient()
        const path     = `${gameId}/${targetPlayer.id}/${Date.now()}.jpg`
        const { error } = await supabase.storage
          .from('killcam')
          .upload(path, blob, { contentType: 'image/jpeg', upsert: false })
        if (error) throw error

        const { data: urlData } = supabase.storage.from('killcam').getPublicUrl(path)

        const killcamPayload = {
          imageUrl:       urlData.publicUrl,
          shooterName:    session.name,
          timestamp:      new Date().toISOString(),
          targetPlayerId: targetPlayer.id,
        }

        // Broadcast（即時表示）と DB 保存（リザルト画面用）を並列実行
        await Promise.all([
          sendKillcam(killcamPayload),
          saveKillcamUrl({
            targetPlayerId: targetPlayer.id,
            gameId,
            url:            urlData.publicUrl,
          }),
        ])
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
      // ホストの現在 GPS 位置をフィールド中心として使用
      // ロビー中は useRadar(enabled=true) なので geoPos が取れている可能性が高い
      await startGame({
        gameId,
        hitDamage:        balanceSettings.hitDamage,
        shootCooldown:    balanceSettings.shootCooldown,
        durationMinutes:  balanceSettings.durationMinutes,
        teamMode:         balanceSettings.teamMode,
        markerMode:       balanceSettings.markerMode,
        gameMode:         balanceSettings.gameMode,
        stormRadiusM:     balanceSettings.stormRadiusM,
        stormFinalM:      balanceSettings.stormFinalM,
        fieldCenterLat:   geoPos?.lat ?? undefined,
        fieldCenterLng:   geoPos?.lng ?? undefined,
        fieldRadiusM:     balanceSettings.fieldRadiusM,
        traitorCount:     balanceSettings.traitorCount,
        sheriffEnabled:   balanceSettings.sheriffEnabled,
      })
    } catch { setIsStarting(false) }
  }

  // DB から取得した確定済みモード（全プレイヤー共通）
  const scanMode = (game?.marker_mode ?? 'qr') as MarkerMode

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
            markerMode={scanMode}
          />
          <HitFlash isFlashing={isFlashing} color={flashColor} />
          {isActive && <TimerDisplay remainingSeconds={remainingSeconds} />}
          {selfPlayer && (
            <HpOverlay
              selfPlayer={selfPlayer}
              allPlayers={players}
              gameMode={game?.game_mode}
            />
          )}

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

      {/* ミニマップ（ゲーム中、死亡スペクテイター含む）
          Comms サボタージュ中はレーダー非表示 */}
      {isActive && session && !(game?.sabotage_type === 'comms' && game.sabotage_until && new Date(game.sabotage_until) > new Date()) && (
        <RadarOverlay
          selfPlayerId={session.playerId}
          players={players}
          geoPos={geoPos}
          gpsAvailable={gpsAvailable}
          objectives={objectives}
          storm={storm}
          game={game}
        />
      )}

      {/* ストームオーバーレイ（バトルモード） */}
      <StormOverlay
        storm={storm}
        visible={isActive && game?.game_mode === 'battle'}
      />

      {/* タクティクス スコア表示 */}
      {game && (
        <TacticsScore
          game={game}
          objectives={objectives}
          visible={isActive && game.game_mode === 'tactics'}
        />
      )}

      {/* 近接オブジェクト操作ボタン（サバイバル・タクティクス・バトル） */}
      {isActive && session && selfPlayer?.is_alive && (
        <ObjectiveAlert
          nearby={nearbyObjectivesWithBonus}
          session={session}
          gameId={gameId}
          team={selfPlayer?.team ?? 'none'}
          isTraitorMode={game?.game_mode === 'traitor'}
          onCaptureDone={playCaptureDone}
          onGeneratorDone={playGeneratorAlert}
        />
      )}

      {/* ── Traitor モード UI ───────────────────────────────────────────────── */}

      {/* タスク進捗バー + 緊急集会ボタン */}
      {isActive && game?.game_mode === 'traitor' && game && selfPlayer && (
        <TaskProgress
          game={game}
          selfPlayer={selfPlayer}
          visible={true}
          meetingActive={meeting.isActive}
          callingMeeting={callingMeeting}
          onCallMeeting={async () => {
            if (!session) return
            setCallingMeeting(true)
            try {
              await callMeeting({ gameId, callerId: session.playerId, deviceId: session.deviceId })
            } catch { /* ignore */ }
            setCallingMeeting(false)
          }}
        />
      )}

      {/* Traitor / Sheriff 専用ボタン */}
      {isActive && game?.game_mode === 'traitor' && selfPlayer && (
        <SpecialRoleHUD
          selfPlayer={selfPlayer}
          sabotageUntil={game?.sabotage_until ?? null}
          nearestCrewDist={nearestCrewDist}
          nearestCrewId={nearestCrewId}
          detectedQRPlayerId={
            // レティクル内の QR から対象プレイヤーを特定（GPS なし時の Sheriff 調査代替）
            detectedQR?.qrCodeId && selfPlayer.role2 === 'sheriff'
              ? players.find(p => p.qr_code_id === detectedQR.qrCodeId && p.id !== selfPlayer.id && p.is_alive)?.id ?? null
              : null
          }
          onSabotage={async () => {
            if (!session) return
            await useSabotage({ gameId, playerId: session.playerId, deviceId: session.deviceId })
          }}
          onInvestigate={async (targetId: string) => {
            if (!session) return { role2: 'crew' as PlayerRole2 }
            return investigatePlayer({
              gameId,
              sheriffId: session.playerId,
              deviceId:  session.deviceId,
              targetId,
            })
          }}
        />
      )}

      {/* ロール開示画面（ゲーム開始直後） */}
      {showRoleReveal && myRole2 && (
        <RoleReveal
          role2={myRole2}
          traitorNames={traitorNames}
          investigateUses={selfPlayer?.investigate_uses ?? 0}
          onDone={() => {
            setShowRoleReveal(false)
            roleRevealDoneRef.current = true
          }}
        />
      )}

      {/* 集会オーバーレイ */}
      {game?.game_mode === 'traitor' && (
        <MeetingOverlay
          visible={meeting.isActive || meetingResult !== null}
          players={players}
          selfPlayer={selfPlayer}
          votes={meeting.votes}
          myVote={meeting.myVote}
          secondsLeft={meeting.secondsLeft}
          isHost={isHost}
          resolveResult={meetingResult}
          onResultDone={() => setMeetingResult(null)}
          onVote={async (targetId) => {
            if (!session) return
            const result = await submitVote({
              gameId,
              voterId:  session.playerId,
              deviceId: session.deviceId,
              targetId,
            })
            if (result.resolved) {
              setMeetingResult({
                exileId:   result.exileId   ?? null,
                exileRole: result.exileRole ?? null,
                gameOver:  result.gameOver  ?? false,
                winner:    result.winner    ?? null,
              })
            }
          }}
          onResolve={async () => {
            if (!session) return
            const result = await resolveMeeting({
              gameId,
              hostId:  session.playerId,
              deviceId: session.deviceId,
            })
            if (result.resolved) {
              setMeetingResult({
                exileId:   result.exileId   ?? null,
                exileRole: result.exileRole ?? null,
                gameOver:  result.gameOver  ?? false,
                winner:    result.winner    ?? null,
              })
            }
          }}
        />
      )}

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
          isTraitorMode={game?.game_mode === 'traitor'}
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
          {/* 非ホスト向けモード表示 */}
          {!isHost && game?.marker_mode && (
            <div className="pointer-events-none bg-black/60 rounded-xl px-3 py-2 text-center">
              <p className="text-gray-500 text-xs">マーカーモード</p>
              <p className={`text-sm font-bold mt-0.5 ${
                game.marker_mode === 'aruco' ? 'text-purple-400' : 'text-green-400'
              }`}>
                {game.marker_mode === 'aruco' ? '◈ ArUco（〜12m）' : '▦ QR（〜5m）'}
              </p>
              <a
                href={game.marker_mode === 'aruco' ? '/aruco' : '/qr'}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-gray-600 underline pointer-events-auto"
              >
                マーカー印刷ページ →
              </a>
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
          {/* マーカー検出中だがレティクル外のヒント */}
          {detectedQR && !stickyInReticle && !isOffline && !cdBlock && (
            <div className="absolute bottom-24 left-0 right-0 flex justify-center pointer-events-none">
              <div className="bg-white/20 text-white text-xs px-3 py-1 rounded-full backdrop-blur-sm">
                {scanMode === 'aruco' ? 'ArUco' : 'QR'}検出 — 中央に合わせてください
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

          {/* 上部コントロール（右側：モードバッジ + AUTO/MANUAL）
              レーダーが左上を占有するため右側にまとめる */}
          <div className="absolute top-4 right-4 flex flex-col items-end gap-2 pointer-events-none">
            {/* モードバッジ */}
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
              scanMode === 'aruco'
                ? 'bg-purple-900/70 border-purple-600 text-purple-300'
                : 'bg-gray-900/70 border-gray-600 text-gray-400'
            }`}>
              {scanMode === 'aruco' ? '◈ ArUco' : '▦ QR'}
            </span>

            {/* AUTO / MANUAL トグル */}
            <button
              onClick={() => setAutoFireEnabled((v) => !v)}
              className={`pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
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
