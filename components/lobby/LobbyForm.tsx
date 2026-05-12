'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createGame, joinGame, quickMatch } from '@/lib/game/actions'
import { Button } from '@/components/ui/Button'
import { MARKER_MODE_KEY, DEFAULT_MARKER_MODE } from '@/lib/game/constants'
import type { MarkerMode } from '@/lib/game/constants'
import type { LocalPlayerSession } from '@/types/game'

function getOrCreateDeviceId(): string {
  const key = 'weasel_device_id'
  let id = localStorage.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(key, id)
  }
  return id
}

function saveSession(session: LocalPlayerSession) {
  sessionStorage.setItem('weasel_session', JSON.stringify(session))
}

interface LobbyFormProps {
  /** 6文字ショートコードまたは UUID。参加フォームに事前入力する */
  initialCode?: string
}

export function LobbyForm({ initialCode }: LobbyFormProps) {
  const router  = useRouter()
  const [name,    setName]    = useState(() =>
    typeof window !== 'undefined' ? (localStorage.getItem('weasel_player_name') ?? '') : ''
  )
  const [code,    setCode]    = useState(initialCode ?? '')
  const [mode,    setMode]    = useState<'select' | 'join'>(initialCode ? 'join' : 'select')
  const [loading, setLoading] = useState<'create' | 'join' | 'quick' | null>(null)
  const [error,   setError]   = useState<string | null>(null)

  function requireName(): boolean {
    if (!name.trim()) { setError('名前を入力してください'); return false }
    return true
  }

  async function handleCreate() {
    if (!requireName()) return
    setLoading('create'); setError(null)
    localStorage.setItem('weasel_player_name', name.trim())
    try {
      const deviceId   = getOrCreateDeviceId()
      const markerMode = (localStorage.getItem(MARKER_MODE_KEY) ?? DEFAULT_MARKER_MODE) as MarkerMode
      const { gameId } = await createGame({ markerMode })
      const { playerId, qrCodeId } = await joinGame({ gameId, name: name.trim(), deviceId })
      saveSession({ deviceId, playerId, gameId, qrCodeId, name: name.trim() })
      router.push(`/game/${gameId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました')
      setLoading(null)
    }
  }

  async function handleJoin() {
    if (!requireName()) return
    if (!code.trim()) return setError('ゲームコードを入力してください')
    setLoading('join'); setError(null)
    localStorage.setItem('weasel_player_name', name.trim())
    try {
      const deviceId = getOrCreateDeviceId()
      const { playerId, qrCodeId, gameId } = await joinGame({
        gameId: code.trim(), name: name.trim(), deviceId,
      })
      saveSession({ deviceId, playerId, gameId, qrCodeId, name: name.trim() })
      router.push(`/game/${gameId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました')
      setLoading(null)
    }
  }

  async function handleQuickMatch() {
    if (!requireName()) return
    setLoading('quick'); setError(null)
    localStorage.setItem('weasel_player_name', name.trim())
    try {
      const deviceId = getOrCreateDeviceId()
      const { playerId, qrCodeId, gameId } = await quickMatch({ name: name.trim(), deviceId })
      saveSession({ deviceId, playerId, gameId, qrCodeId, name: name.trim() })
      router.push(`/game/${gameId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました')
      setLoading(null)
    }
  }

  return (
    <div className="flex flex-col gap-4 w-full max-w-sm">
      {/* 名前入力 */}
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-1">プレイヤー名</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            if (mode === 'join') handleJoin()
            else handleCreate()
          }}
          placeholder="名前を入力..."
          maxLength={16}
          className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-green-500"
        />
      </div>

      {/* ─── 選択画面 ─── */}
      {mode === 'select' && (
        <div className="flex flex-col gap-3">
          <Button onClick={handleCreate} loading={loading === 'create'}>
            新しいゲームを作成
          </Button>

          <Button variant="secondary" onClick={() => setMode('join')}>
            コードで参加
          </Button>

          {/* クイックマッチ */}
          <button
            onClick={handleQuickMatch}
            disabled={loading !== null}
            className="w-full flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 border border-gray-700 disabled:opacity-40 text-gray-300 rounded-xl py-3 text-sm font-medium transition-colors"
          >
            {loading === 'quick' ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                マッチング中...
              </>
            ) : (
              <>
                <span className="text-base">⚡</span>
                クイックマッチ
                <span className="text-xs text-gray-600">（空きゲームに自動参加）</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* ─── コード入力画面 ─── */}
      {mode === 'join' && (
        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">
              ゲームコード
              <span className="ml-1 text-gray-600 font-normal text-xs">（6文字）</span>
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === 'Enter') handleJoin() }}
              placeholder="例: AB3X7K"
              maxLength={36}
              autoCapitalize="characters"
              className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 font-mono text-xl tracking-[0.3em] text-center outline-none focus:ring-2 focus:ring-green-500 placeholder-gray-600"
            />
          </div>
          <Button onClick={handleJoin} loading={loading === 'join'}>
            参加する
          </Button>
          <Button variant="secondary" onClick={() => { setMode('select'); setCode('') }}>
            戻る
          </Button>
        </div>
      )}

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}
    </div>
  )
}
