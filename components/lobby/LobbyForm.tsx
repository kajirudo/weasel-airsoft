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
  /** 6-char short code OR full UUID. Pre-fills the join field. */
  initialCode?: string
}

export function LobbyForm({ initialCode }: LobbyFormProps) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [code, setCode] = useState(initialCode ?? '')
  const [mode, setMode] = useState<'select' | 'join'>(initialCode ? 'join' : 'select')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    if (!name.trim()) return setError('名前を入力してください')
    setLoading(true)
    setError(null)
    try {
      const deviceId = getOrCreateDeviceId()
      const { gameId } = await createGame()
      const { playerId, qrCodeId } = await joinGame({ gameId, name: name.trim(), deviceId })
      saveSession({ deviceId, playerId, gameId, qrCodeId, name: name.trim() })
      router.push(`/game/${gameId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました')
      setLoading(false)
    }
  }

  async function handleJoin() {
    if (!name.trim()) return setError('名前を入力してください')
    if (!code.trim()) return setError('ゲームコードを入力してください')
    setLoading(true)
    setError(null)
    try {
      const deviceId = getOrCreateDeviceId()
      const { playerId, qrCodeId, gameId } = await joinGame({
        gameId: code.trim(),
        name: name.trim(),
        deviceId,
      })
      saveSession({ deviceId, playerId, gameId, qrCodeId, name: name.trim() })
      router.push(`/game/${gameId}`)
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
          onKeyDown={(e) => { if (e.key === 'Enter') mode === 'join' ? handleJoin() : handleCreate() }}
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
          <Button onClick={handleJoin} loading={loading}>
            参加する
          </Button>
          <Button variant="secondary" onClick={() => { setMode('select'); setCode('') }}>
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
