'use client'

/**
 * DEBUG SIMULATOR — Client Component
 *
 * 使い方:
 *   1. 複数のブラウザタブで /debug を開く
 *   2. 各タブで「作成」または「参加」する
 *   3. ホストタブで「ゲーム開始」をクリック
 *   4. 各タブの「SHOOT」ボタンで相手プレイヤーを撃つ
 */

import { useState, useCallback, useEffect } from 'react'
import { createGame, joinGame, startGame, registerHit } from '@/lib/game/actions'
import { usePlayerRealtime } from '@/hooks/usePlayerRealtime'
import { useGameRealtime }   from '@/hooks/useGameRealtime'
import { useHeartbeat }      from '@/hooks/useHeartbeat'
import { MAX_HP }            from '@/lib/game/constants'
import type { LocalPlayerSession } from '@/types/game'
import type { Player, QrCodeId }  from '@/types/database'

// ─── ユーティリティ ────────────────────────────────────────────────────────────
function getOrCreateDeviceId(): string {
  const key = 'weasel_device_id'
  let id = localStorage.getItem(key)
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(key, id) }
  return id
}

const QR_LABELS: Record<QrCodeId, string> = {
  player_1: 'P1', player_2: 'P2', player_3: 'P3', player_4: 'P4', player_5: 'P5', player_6: 'P6',
}

function HpBar({ hp }: { hp: number }) {
  const pct   = Math.max(0, (hp / MAX_HP) * 100)
  const color = hp > 60 ? 'bg-green-500' : hp > 25 ? 'bg-yellow-400' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-300 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono w-8 text-right text-gray-300">{hp}</span>
    </div>
  )
}

// ─── メインコンポーネント ──────────────────────────────────────────────────────
export function DebugClient() {
  const [session, setSession]     = useState<LocalPlayerSession | null>(null)
  const [gameIdInput, setInput]   = useState('')
  const [nameInput, setName]      = useState(() => 'Dev' + Math.floor(Math.random() * 100))
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [shootLog, setLog]        = useState<string[]>([])
  const [isStarting, setStarting] = useState(false)

  const gameId = session?.gameId ?? ''

  const addLog = useCallback((msg: string) => {
    const t = new Date().toLocaleTimeString()
    setLog((prev) => [`[${t}] ${msg}`, ...prev].slice(0, 40))
  }, [])

  const { players, realtimeStatus } = usePlayerRealtime(gameId)
  const { game }                    = useGameRealtime(gameId)

  useHeartbeat({
    gameId,
    playerId:   session?.playerId,
    deviceId:   session?.deviceId,
    gameStatus: game?.status,
  })

  // デバッグ専用セッション（本番の sessionStorage と分離）
  useEffect(() => {
    const raw = sessionStorage.getItem('weasel_debug_session')
    if (raw) setSession(JSON.parse(raw))
  }, [])

  function saveSession(s: LocalPlayerSession) {
    sessionStorage.setItem('weasel_debug_session', JSON.stringify(s))
    setSession(s)
  }

  // ─── アクション ──────────────────────────────────────────────────────────────

  async function handleCreate() {
    if (!nameInput.trim()) return setError('名前を入力してください')
    setLoading(true); setError(null)
    try {
      const deviceId = getOrCreateDeviceId()
      const { gameId: gid, shortCode } = await createGame()
      const { playerId, qrCodeId }     = await joinGame({ gameId: gid, name: nameInput, deviceId })
      saveSession({ deviceId, playerId, gameId: gid, qrCodeId, name: nameInput })
      addLog(`ゲーム作成: ${shortCode} (${gid.slice(0, 8)}…) スロット=${qrCodeId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラー')
    } finally { setLoading(false) }
  }

  async function handleJoin() {
    if (!nameInput.trim()) return setError('名前を入力してください')
    if (!gameIdInput.trim()) return setError('ゲームIDを入力してください')
    setLoading(true); setError(null)
    try {
      const deviceId = getOrCreateDeviceId()
      const { playerId, qrCodeId } = await joinGame({
        gameId: gameIdInput.trim(), name: nameInput, deviceId,
      })
      saveSession({ deviceId, playerId, gameId: gameIdInput.trim(), qrCodeId, name: nameInput })
      addLog(`ゲーム参加: スロット=${qrCodeId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラー')
    } finally { setLoading(false) }
  }

  async function handleShoot(target: Player) {
    if (!session) return
    try {
      const result = await registerHit({
        gameId:          session.gameId,
        shooterPlayerId: session.playerId,
        shooterDeviceId: session.deviceId,
        targetQrCodeId:  target.qr_code_id,
      })
      addLog(
        `SHOOT ${target.name} (${QR_LABELS[target.qr_code_id]})` +
        ` → HP ${result.newHp}` +
        (result.gameOver ? ' 🏆 GAME OVER' : '')
      )
    } catch (e) {
      addLog(`MISS: ${e instanceof Error ? e.message : 'エラー'}`)
    }
  }

  async function handleStart() {
    if (!session) return
    setStarting(true)
    try {
      await startGame({ gameId: session.gameId, hitDamage: 25, shootCooldown: 800 })
      addLog('ゲーム開始')
    } catch (e) {
      addLog(`開始失敗: ${e instanceof Error ? e.message : 'エラー'}`)
    } finally { setStarting(false) }
  }

  function handleReset() {
    sessionStorage.removeItem('weasel_debug_session')
    setSession(null); setLog([]); setInput('')
  }

  const selfPlayer = players.find((p) => p.id === session?.playerId)
  const opponents  = players.filter((p) => p.id !== session?.playerId && p.is_alive)
  const isHost     = players.length > 0 && players[0].id === session?.playerId

  // ─── UI ──────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 text-white font-mono p-4 space-y-4">

      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs text-yellow-400 bg-yellow-400/10 border border-yellow-400/30 px-2 py-0.5 rounded">
            DEV ONLY
          </span>
          <h1 className="font-bold tracking-tight">
            WEASEL AIRSOFT <span className="text-gray-500 font-normal">— Debug Simulator</span>
          </h1>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className={`w-2 h-2 rounded-full ${
            realtimeStatus === 'connected'   ? 'bg-green-400' :
            realtimeStatus === 'connecting'  ? 'bg-blue-400 animate-pulse' :
            realtimeStatus === 'error'       ? 'bg-red-400' :
                                               'bg-yellow-400 animate-pulse'
          }`} />
          {realtimeStatus}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ─── 左: セッション管理 ─── */}
        <div className="space-y-3">
          <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
            <p className="text-xs text-gray-500 uppercase tracking-wider">セッション</p>

            {!session ? (
              <>
                <label className="block">
                  <span className="text-xs text-gray-400">プレイヤー名</span>
                  <input
                    value={nameInput}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full mt-1 bg-gray-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-green-500"
                  />
                </label>

                <label className="block">
                  <span className="text-xs text-gray-400">ゲームID（参加時のみ）</span>
                  <input
                    value={gameIdInput}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="空白で新規作成"
                    className="w-full mt-1 bg-gray-800 rounded-lg px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-green-500 placeholder-gray-600"
                  />
                </label>

                <div className="flex gap-2">
                  <button
                    onClick={handleCreate}
                    disabled={loading}
                    className="flex-1 bg-green-700 hover:bg-green-600 disabled:opacity-50 rounded-lg py-2 text-sm font-bold"
                  >
                    {loading ? '…' : '作成'}
                  </button>
                  <button
                    onClick={handleJoin}
                    disabled={loading || !gameIdInput.trim()}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 rounded-lg py-2 text-sm"
                  >
                    {loading ? '…' : '参加'}
                  </button>
                </div>
                {error && <p className="text-red-400 text-xs">{error}</p>}
              </>
            ) : (
              <div className="space-y-2 text-xs">
                {[
                  ['名前',     session.name],
                  ['スロット', QR_LABELS[session.qrCodeId]],
                  ['ゲームID', session.gameId.slice(0, 16) + '…'],
                  ['状態',     game?.status ?? '—'],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-gray-500">{label}</span>
                    <span className={
                      label === 'スロット' ? 'text-green-400 font-bold' :
                      label === '状態' && game?.status === 'active'   ? 'text-green-400' :
                      label === '状態' && game?.status === 'finished' ? 'text-red-400'   :
                      label === '状態'                                 ? 'text-yellow-400' :
                      'text-gray-300'
                    }>
                      {val}
                    </span>
                  </div>
                ))}

                <button
                  onClick={handleReset}
                  className="w-full mt-2 bg-gray-800 hover:bg-gray-700 rounded-lg py-1.5 text-gray-400"
                >
                  セッションをリセット
                </button>
              </div>
            )}
          </section>

          {/* ゲーム開始（ホストのみ） */}
          {session && isHost && game?.status === 'lobby' && (
            <button
              onClick={handleStart}
              disabled={isStarting || players.length < 2}
              className="w-full bg-green-700 hover:bg-green-600 disabled:opacity-40 rounded-xl py-3 font-bold text-sm"
            >
              {isStarting            ? '開始中...'            :
               players.length < 2   ? `あと${2 - players.length}人で開始可能` :
                                      `ゲーム開始 (${players.length}人)`}
            </button>
          )}

          {/* 自分のHP */}
          {selfPlayer && (
            <section className="bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-1">
              <p className="text-xs text-gray-500">自分の HP</p>
              <HpBar hp={selfPlayer.hp} />
              {!selfPlayer.is_alive && (
                <p className="text-red-400 text-xs font-bold text-center pt-1">DEAD</p>
              )}
            </section>
          )}
        </div>

        {/* ─── 中: プレイヤー一覧 + 射撃 ─── */}
        <div className="space-y-3">
          <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
            <p className="text-xs text-gray-500 uppercase tracking-wider">
              プレイヤー ({players.length}/6)
            </p>

            {players.length === 0 && (
              <p className="text-gray-700 text-xs">参加者なし</p>
            )}

            {players.map((p) => {
              const isSelf    = p.id === session?.playerId
              const canShoot  = session && !isSelf && p.is_alive && game?.status === 'active'
              return (
                <div
                  key={p.id}
                  className={`rounded-lg px-3 py-2.5 space-y-1.5 border ${
                    isSelf ? 'bg-green-950 border-green-800' : 'bg-gray-800 border-gray-700'
                  } ${!p.is_alive ? 'opacity-40' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-green-400 font-bold text-xs">
                        {QR_LABELS[p.qr_code_id]}
                      </span>
                      <span>{p.name}</span>
                      {isSelf && <span className="text-xs text-green-500">(YOU)</span>}
                      {!p.is_alive && <span className="text-xs text-red-400 font-bold">DEAD</span>}
                    </div>
                    {canShoot && (
                      <button
                        onClick={() => handleShoot(p)}
                        className="bg-red-700 hover:bg-red-600 active:scale-95 text-xs font-bold px-3 py-1 rounded-lg transition-all"
                      >
                        SHOOT
                      </button>
                    )}
                  </div>
                  <HpBar hp={p.hp} />
                </div>
              )
            })}
          </section>

          {/* 残り生存者（ゲーム中） */}
          {game?.status === 'active' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-xs text-center">
              <span className="text-gray-500">生存: </span>
              <span className="text-white font-bold">
                {players.filter((p) => p.is_alive).length} / {players.length}
              </span>
            </div>
          )}
        </div>

        {/* ─── 右: ログ ─── */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500 uppercase tracking-wider">イベントログ</p>
            <button
              onClick={() => setLog([])}
              className="text-xs text-gray-600 hover:text-gray-400"
            >
              クリア
            </button>
          </div>
          <div className="space-y-1 max-h-[480px] overflow-y-auto pr-1">
            {shootLog.length === 0 && (
              <p className="text-gray-700 text-xs">— アクションを実行するとここに表示されます —</p>
            )}
            {shootLog.map((line, i) => (
              <p key={i} className={`text-xs leading-relaxed ${
                line.includes('GAME OVER')  ? 'text-yellow-400 font-bold' :
                line.includes('SHOOT')      ? 'text-red-300' :
                line.includes('MISS')       ? 'text-gray-500' :
                                              'text-gray-400'
              }`}>
                {line}
              </p>
            ))}
          </div>
        </section>

      </div>

      <p className="text-center text-gray-700 text-xs">
        NODE_ENV=development 専用 — 本番ビルドでは 404 になります
      </p>
    </div>
  )
}
