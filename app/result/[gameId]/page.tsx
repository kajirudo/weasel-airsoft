import { createServerClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { QrCodeId, Team, PlayerRole2 } from '@/types/database'
import { QR_LABELS, ROLE2_LABELS, ROLE2_COLORS } from '@/lib/game/constants'
import { RematchSection } from './RematchSection'

interface ResultPageProps {
  params: Promise<{ gameId: string }>
}

export default async function ResultPage({ params }: ResultPageProps) {
  const { gameId } = await params
  const supabase   = createServerClient()

  const { data: game } = await supabase
    .from('games')
    .select('*, winner:winner_id(name, qr_code_id)')
    .eq('id', gameId)
    .single()

  const TEAM_BADGE: Record<Team, string> = { none: '', red: '🔴', blue: '🔵' }

  // joined_at 順で取得 → players[0] がホスト
  const { data: players } = await supabase
    .from('players')
    .select('*')
    .eq('game_id', gameId)
    .order('joined_at', { ascending: true })

  const winner      = game?.winner as { name: string; qr_code_id: string } | null
  const winnerTeam  = game?.winner_team ?? null
  const gameMode    = game?.game_mode ?? 'deathmatch'
  const isTraitorMode = gameMode === 'traitor'
  const hostPlayer  = players?.[0]

  // スコア表示は kills 降順 → hp 降順
  const sortedPlayers = [...(players ?? [])].sort(
    (a, b) => b.kills - a.kills || b.hp - a.hp
  )

  // キルカム証拠写真（killcam_url がある = 撃たれたプレイヤー）
  const killcamPlayers = (players ?? []).filter((p) => p.killcam_url)

  const duration =
    game?.started_at && game?.finished_at
      ? Math.round(
          (new Date(game.finished_at).getTime() - new Date(game.started_at).getTime()) / 1000
        )
      : null
  const durationLabel = duration !== null
    ? `${Math.floor(duration / 60)}分${duration % 60}秒`
    : null

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm flex flex-col items-center gap-6">

        {/* 勝者発表 */}
        <div className="text-center space-y-2">
          <p className="text-gray-500 text-xs uppercase tracking-widest">GAME OVER</p>
          {winnerTeam ? (
            <>
              <p className={`font-black text-5xl ${
                winnerTeam === 'red'      ? 'text-red-400'    :
                winnerTeam === 'blue'     ? 'text-blue-400'   :
                winnerTeam === 'crew'     ? 'text-green-400'  :
                winnerTeam === 'traitor'  ? 'text-red-400'    :
                winnerTeam === 'hunter'   ? 'text-orange-400' :
                winnerTeam === 'survivor' ? 'text-purple-400' :
                'text-yellow-400'
              }`}>
                {winnerTeam === 'red'      ? '🔴 赤チーム'       :
                 winnerTeam === 'blue'     ? '🔵 青チーム'       :
                 winnerTeam === 'crew'     ? '👷 Crew'          :
                 winnerTeam === 'traitor'  ? '🕵️ スパイ'        :
                 winnerTeam === 'hunter'   ? '🔦 Hunter'        :
                 winnerTeam === 'survivor' ? '✨ Survivor'      :
                 winnerTeam}
              </p>
              <p className="text-white text-xl font-bold">の勝利！🏆</p>
            </>
          ) : winner ? (
            <>
              <p className="text-yellow-400 font-black text-5xl">{winner.name}</p>
              <p className="text-white text-xl font-bold">の勝利！🏆</p>
            </>
          ) : (
            <p className="text-white font-black text-4xl">引き分け</p>
          )}
          {durationLabel && (
            <p className="text-gray-600 text-xs">ゲーム時間: {durationLabel}</p>
          )}
        </div>

        {/* スコアボード */}
        {sortedPlayers.length > 0 && (
          <div className="w-full bg-gray-900 rounded-2xl overflow-hidden">
            <div className={`grid ${isTraitorMode ? 'grid-cols-[1.5rem_1fr_3rem_2.5rem_2.5rem_2.5rem]' : 'grid-cols-[1.5rem_1fr_2.5rem_2.5rem_2.5rem]'} gap-2 px-4 py-2 bg-gray-800 text-gray-500 text-xs uppercase tracking-wide`}>
              <span>#</span>
              <span>名前</span>
              {isTraitorMode && <span className="text-center">役職</span>}
              <span className="text-center">HP</span>
              <span className="text-center">Kill</span>
              <span className="text-center">QR</span>
            </div>
            {sortedPlayers.map((p, i) => {
              const isWinner  = winner && p.name === winner.name
              const role2     = p.role2 as PlayerRole2 | undefined
              const roleColor = role2 ? ROLE2_COLORS[role2] : undefined
              const roleLabel = role2 ? ROLE2_LABELS[role2] : null
              return (
                <div
                  key={p.id}
                  className={`grid ${isTraitorMode ? 'grid-cols-[1.5rem_1fr_3rem_2.5rem_2.5rem_2.5rem]' : 'grid-cols-[1.5rem_1fr_2.5rem_2.5rem_2.5rem]'} gap-2 px-4 py-3 items-center border-t border-gray-800
                    ${isWinner ? 'bg-yellow-400/10' : ''}
                    ${!p.is_alive ? 'opacity-50' : ''}
                  `}
                >
                  <span className="text-gray-500 text-sm">{i + 1}</span>
                  <div className="flex items-center gap-1.5 min-w-0">
                    {isWinner && <span className="text-yellow-400 text-sm flex-shrink-0">👑</span>}
                    {p.team !== 'none' && (
                      <span className="flex-shrink-0">{TEAM_BADGE[p.team as Team]}</span>
                    )}
                    <span className="text-white font-medium truncate">{p.name}</span>
                  </div>
                  {isTraitorMode && (
                    <span
                      className="text-[9px] font-black px-1 py-0.5 rounded leading-none text-center"
                      style={roleColor ? {
                        backgroundColor: roleColor + '33',
                        color:           roleColor,
                        border:          `1px solid ${roleColor}88`,
                      } : { color: '#6b7280' }}
                    >
                      {roleLabel ?? '—'}
                    </span>
                  )}
                  <span className={`text-sm font-mono text-center ${p.is_alive ? 'text-green-400' : 'text-red-400'}`}>
                    {p.hp}
                  </span>
                  <span className={`text-sm font-mono text-center ${p.kills > 0 ? 'text-yellow-400' : 'text-gray-600'}`}>
                    {p.kills}
                  </span>
                  <span className="text-xs font-mono text-gray-500 text-center">
                    {QR_LABELS[p.qr_code_id as QrCodeId]}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* ── キルカム証拠写真 ── */}
        {killcamPlayers.length > 0 && (
          <div className="w-full space-y-3">
            <p className="text-gray-500 text-xs uppercase tracking-widest text-center">
              📸 証拠写真
            </p>
            <div className="space-y-3">
              {killcamPlayers.map((p) => (
                <div key={p.id} className="bg-gray-900 rounded-xl overflow-hidden border border-gray-800">
                  {/* ヘッダー */}
                  <div className="flex items-center justify-between px-3 py-2 bg-gray-800">
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-gray-400 font-mono">{QR_LABELS[p.qr_code_id as QrCodeId]}</span>
                      <span className="text-white font-semibold">{p.name}</span>
                      <span className="text-gray-500">が</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-red-400 font-bold">
                      <span>{p.killer_name ?? '—'}</span>
                      <span className="text-gray-500">に倒される</span>
                    </div>
                  </div>

                  {/* 証拠写真 */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.killcam_url!}
                    alt={`${p.name} のキルカム`}
                    className="w-full h-auto block"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* アクション */}
        <div className="w-full flex flex-col gap-3">
          {hostPlayer && (
            <RematchSection
              gameId={gameId}
              hostPlayerId={hostPlayer.id}
              initialNextGameId={game?.next_game_id ?? null}
            />
          )}
          <Link
            href="/lobby"
            className="w-full text-center bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium py-2.5 rounded-xl transition-colors text-sm"
          >
            ロビーに戻る
          </Link>
        </div>
      </div>
    </div>
  )
}
