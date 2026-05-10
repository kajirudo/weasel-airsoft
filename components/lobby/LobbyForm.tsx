'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createGame, joinGame } from '@/lib/game/actions'
import { Button } from '@/components/ui/Button'
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
  gameId?: string
}

export function LobbyForm({ gameId: initialGameId }: LobbyFormProps) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [gameId, setGameId] = useState(initialGameId ?? '')
  const [mode, setMode] = useState<'select' | 'join'>('select')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    if (!name.trim()) return setError('名前を入力してください')
    setLoading(true)
    setError(null)
    try {
      const deviceId = getOrCreateDeviceId()
      const { gameId: newGameId } = await createGame()
      const { playerId, qrCodeId } = await joinGame({ gameId: newGameId, name: name.trim(), deviceId })
      saveSession({ deviceId, playerId, gameId: newGameId, qrCodeId, name: name.trim() })
      router.push(`/game/${newGameId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました')
      setLoading(false)
    }
  }

  async function handleJoin() {
    if (!name.trim()) return setError('名前を入力してください')
    if (!gameId.trim()) return setError('ゲームIDを入力してください')
    setLoading(true)
    setError(null)
    try {
      const deviceId = getOrCreateDeviceId()
      const { playerId, qrCodeId } = await joinGame({ gameId: gameId.trim(), name: name.trim(), deviceId })
      saveSession({ deviceId, playerId, gameId: gameId.trim(), qrCodeId, name: name.trim() })
      router.push(`/game/${gameId.trim()}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました')
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 w-full max-w-sm">
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-1">プレイヤー名</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="名前を入力..."
          maxLength={16}
          className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-green-500"
        />
      </div>

      {mode === 'select' && (
        <div className="flex flex-col gap-3">
          <Button onClick={handleCreate} loading={loading}>
            新しいゲームを作成
          </Button>
          <Button variant="secondary" onClick={() => setMode('join')}>
            ゲームに参加
          </Button>
        </div>
      )}

      {mode === 'join' && (
        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">ゲームID</label>
            <input
              type="text"
              value={gameId}
              onChange={(e) => setGameId(e.target.value)}
              placeholder="ゲームIDを入力..."
              className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 font-mono outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <Button onClick={handleJoin} loading={loading}>
            参加する
          </Button>
          <Button variant="secondary" onClick={() => setMode('select')}>
            戻る
          </Button>
        </div>
      )}

      {error && (
        <p className="text-red-400 text-sm text-center">{error}</p>
      )}
    </div>
  )
}
