'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { createRematch, joinGame } from '@/lib/game/actions'
import type { LocalPlayerSession } from '@/types/game'
import type { Game } from '@/types/database'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

interface RematchSectionProps {
  gameId:            string
  hostPlayerId:      string
  initialNextGameId: string | null
}

/**
 * リザルト画面のリマッチ UI。
 *
 * ホスト：「リマッチ作成」ボタン → createRematch → joinGame → /game/[new]
 * 非ホスト：Realtime で next_game_id を監視 → ボタン出現 → joinGame → /game/[new]
 */
export function RematchSection({
  gameId,
  hostPlayerId,
  initialNextGameId,
}: RematchSectionProps) {
  const router  = useRouter()
  const [session,    setSession]    = useState<LocalPlayerSession | null>(null)
  const [nextGameId, setNextGameId] = useState<string | null>(initialNextGameId)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  // sessionStorage からセッション復元
  useEffect(() => {
    const raw = sessionStorage.getItem('weasel_session')
    if (raw) setSession(JSON.parse(raw))
  }, [])

  // 旧ゲームの next_game_id を Realtime 監視
  useEffect(() => {
    if (initialNextGameId) return // すでに確定済みなら購読不要
    const supabase = createClient()

    const channel = supabase
      .channel(`result:${gameId}:rematch`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        (payload: RealtimePostgresChangesPayload<Game>) => {
          const updated = payload.new as Game
          if (updated.next_game_id) setNextGameId(updated.next_game_id)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [gameId, initialNextGameId])

  const isHost = session?.playerId === hostPlayerId

  // ─── リマッチ参加（ホスト・非ホスト共通） ──────────────────────────────
  async function joinRematch(targetGameId: string) {
    if (!session) return
    setLoading(true)
    setError(null)
    try {
      const { playerId, qrCodeId, gameId: resolvedId } = await joinGame({
        gameId:   targetGameId,
        name:     session.name,
        deviceId: session.deviceId,
      })
      // sessionStorage を新しいゲームで上書き
      const newSession: LocalPlayerSession = {
        ...session,
        playerId,
        qrCodeId,
        gameId: resolvedId,
      }
      sessionStorage.setItem('weasel_session', JSON.stringify(newSession))
      router.push(`/game/${resolvedId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました')
      setLoading(false)
    }
  }

  // ─── ホスト：リマッチ作成 ───────────────────────────────────────────────
  async function handleCreateRematch() {
    if (!session) return
    setLoading(true)
    setError(null)
    try {
      const { gameId: newGameId } = await createRematch({ prevGameId: gameId })
      await joinRematch(newGameId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました')
      setLoading(false)
    }
  }

  if (!session) return null

  return (
    <div className="w-full space-y-3">
      <div className="border-t border-gray-800 pt-4">
        {/* ── リマッチ通知が来た（非ホスト） ─────────────────────────── */}
        {nextGameId && !isHost && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 justify-center">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <p className="text-green-400 text-sm font-semibold">リマッチが用意されました！</p>
            </div>
            <button
              onClick={() => joinRematch(nextGameId)}
              disabled={loading}
              className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-bold text-lg py-3 rounded-xl transition-colors active:scale-95"
            >
              {loading ? '参加中...' : 'リマッチ参加する →'}
            </button>
          </div>
        )}

        {/* ── ホストがリマッチを作成済み ───────────────────────────────── */}
        {nextGameId && isHost && (
          <p className="text-gray-500 text-xs text-center">
            リマッチを作成しました。他のプレイヤーが参加するのを待っています...
          </p>
        )}

        {/* ── ホスト：リマッチ作成ボタン ───────────────────────────────── */}
        {!nextGameId && isHost && (
          <button
            onClick={handleCreateRematch}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors active:scale-95"
          >
            {loading ? '作成中...' : '🔄 リマッチ作成（同じメンバーで再戦）'}
          </button>
        )}

        {/* ── 非ホスト：待機中 ─────────────────────────────────────────── */}
        {!nextGameId && !isHost && (
          <p className="text-gray-600 text-xs text-center py-2">
            ホストがリマッチを作成するまで待機中...
          </p>
        )}
      </div>

      {error && <p className="text-red-400 text-xs text-center">{error}</p>}
    </div>
  )
}
