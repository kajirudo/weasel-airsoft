'use client'

import { useState } from 'react'
import { MEETING_DURATION_MS } from '@/lib/game/constants'
import type { Player, TraitorVote } from '@/types/database'

interface Props {
  visible:        boolean
  players:        Player[]
  selfPlayer:     Player | undefined
  votes:          TraitorVote[]
  myVote:         TraitorVote | null
  secondsLeft:    number
  /** ホストか（集会解決ボタン表示用） */
  isHost:         boolean
  onVote:         (targetId: string | null) => Promise<void>
  /** ホスト用: タイマー切れ後に手動で集会を解決 */
  onResolve:      () => Promise<void>
  /** 結果表示（exileId が null = スキップ/流れ） */
  resolveResult:  { exileId: string | null; exileRole: string | null; gameOver: boolean; winner: string | null } | null
  onResultDone:   () => void
}

export function MeetingOverlay({
  visible, players, selfPlayer, votes, myVote,
  secondsLeft, isHost, onVote, onResolve,
  resolveResult, onResultDone,
}: Props) {
  const [voting, setVoting] = useState(false)

  if (!visible) return null

  // ── 結果画面 ──────────────────────────────────────────────────────────
  if (resolveResult) {
    const exiled = resolveResult.exileId
      ? players.find(p => p.id === resolveResult.exileId)
      : null
    return (
      <ResolveScreen
        exiled={exiled ?? null}
        exileRole={resolveResult.exileRole}
        gameOver={resolveResult.gameOver}
        winner={resolveResult.winner}
        onDone={onResultDone}
      />
    )
  }

  // 投票集計: targetId → 票数
  const voteCounts: Record<string, number> = {}
  let skipCount = 0
  for (const v of votes) {
    if (v.target_id === null) { skipCount++; continue }
    voteCounts[v.target_id] = (voteCounts[v.target_id] ?? 0) + 1
  }

  const alivePlayers = players.filter(p => p.is_alive)
  const totalVoters  = alivePlayers.length
  const voted        = votes.length

  const timerPct    = MEETING_DURATION_MS > 0
    ? Math.min(100, (secondsLeft / (MEETING_DURATION_MS / 1000)) * 100)
    : 0
  const timerColor  = secondsLeft <= 10 ? '#ef4444' : secondsLeft <= 20 ? '#f59e0b' : '#22c55e'

  const handleVote = async (targetId: string | null) => {
    if (myVote || voting) return
    setVoting(true)
    try { await onVote(targetId) } catch { /* ignore */ }
    setVoting(false)
  }

  return (
    <div className="fixed inset-0 z-[150] flex flex-col bg-gray-900/97 select-none overflow-y-auto">
      {/* ヘッダー */}
      <div className="sticky top-0 bg-gray-900 z-10 px-4 pt-4 pb-2 border-b border-white/10">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-white font-black text-xl">🗣 緊急集会</h2>
          <div className="flex items-center gap-2">
            <span className="text-white/60 text-sm">{voted}/{totalVoters} 投票済み</span>
            {/* タイマー */}
            <div className="flex items-center gap-1">
              <div className="w-20 h-2 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${timerPct}%`, backgroundColor: timerColor }}
                />
              </div>
              <span className="text-white font-mono text-sm w-6 text-right" style={{ color: timerColor }}>
                {secondsLeft}
              </span>
            </div>
          </div>
        </div>
        {myVote && (
          <p className="text-white/50 text-xs">
            投票済み: {myVote.target_id === null ? 'スキップ' : players.find(p => p.id === myVote.target_id)?.name ?? '不明'}
          </p>
        )}
      </div>

      {/* プレイヤーカードグリッド */}
      <div className="flex-1 p-3 grid grid-cols-2 gap-2">
        {alivePlayers.map(p => {
          const isMe     = p.id === selfPlayer?.id
          const voteCount = voteCounts[p.id] ?? 0
          const iVotedThem = myVote?.target_id === p.id

          return (
            <button
              key={p.id}
              onPointerDown={() => handleVote(p.id)}
              disabled={isMe || !!myVote || voting}
              className="relative flex flex-col items-center justify-center p-3 rounded-xl border-2 transition disabled:opacity-60"
              style={{
                borderColor: iVotedThem ? '#ef4444' : 'rgba(255,255,255,0.15)',
                backgroundColor: iVotedThem ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.05)',
              }}
            >
              {/* 名前 */}
              <span className="text-white font-bold text-sm text-center leading-tight">
                {isMe ? `${p.name} (自分)` : p.name}
              </span>

              {/* 投票バッジ */}
              {voteCount > 0 && (
                <span className="mt-1 px-2 py-0.5 bg-red-600 text-white text-xs rounded-full font-bold">
                  ×{voteCount}
                </span>
              )}

              {/* 投票済みマーク */}
              {votes.some(v => v.voter_id === p.id) && (
                <span className="absolute top-1 right-1 text-green-400 text-xs">✓</span>
              )}
            </button>
          )
        })}
      </div>

      {/* アクションバー */}
      <div className="sticky bottom-0 bg-gray-900 border-t border-white/10 p-3 flex gap-2">
        {/* スキップ */}
        {!myVote && (
          <button
            onPointerDown={() => handleVote(null)}
            disabled={voting}
            className="flex-1 py-3 rounded-xl bg-white/10 text-white/70 font-bold text-sm disabled:opacity-40"
          >
            スキップ ({skipCount}票)
          </button>
        )}

        {/* ホスト: タイマー切れ後に手動解決 */}
        {isHost && secondsLeft === 0 && (
          <button
            onPointerDown={onResolve}
            className="flex-1 py-3 rounded-xl bg-yellow-600 text-white font-bold text-sm"
          >
            集会を終了
          </button>
        )}
      </div>
    </div>
  )
}

// ── 結果サブコンポーネント ─────────────────────────────────────────────────────

function ResolveScreen({
  exiled, exileRole, gameOver, winner, onDone,
}: {
  exiled:    Player | null
  exileRole: string | null
  gameOver:  boolean
  winner:    string | null
  onDone:    () => void
}) {
  const wasTraitor = exileRole === 'traitor'

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/95 px-6 select-none">
      {exiled ? (
        <>
          <p className="text-white/60 text-sm mb-2">追放されました</p>
          <p className="text-white font-black text-4xl mb-4">{exiled.name}</p>
          <div
            className="text-5xl font-black mb-4"
            style={{ color: wasTraitor ? '#ef4444' : '#22c55e' }}
          >
            {wasTraitor ? '🕵️ SPY' : '👷 CREW'}
          </div>
          {!wasTraitor && (
            <p className="text-yellow-400 font-bold text-lg">⚠️ 無実の Crew でした…</p>
          )}
        </>
      ) : (
        <>
          <p className="text-white font-black text-3xl mb-4">🤐 決着つかず</p>
          <p className="text-white/60 text-sm">票が割れたため追放なし</p>
        </>
      )}

      {gameOver && (
        <div className="mt-8 text-center">
          <p className="text-white/60 text-sm mb-1">ゲーム終了</p>
          <p
            className="text-4xl font-black"
            style={{ color: winner === 'crew' ? '#22c55e' : '#ef4444' }}
          >
            {winner === 'crew' ? '👷 CREW WIN' : '🕵️ TRAITOR WIN'}
          </p>
        </div>
      )}

      <button
        onPointerDown={onDone}
        className="mt-10 px-10 py-3 bg-white/10 text-white rounded-full font-bold"
      >
        閉じる
      </button>
    </div>
  )
}
