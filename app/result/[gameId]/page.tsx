import { createServerClient } from '@/lib/supabase/server'
import Link from 'next/link'

interface ResultPageProps {
  params: Promise<{ gameId: string }>
}

export default async function ResultPage({ params }: ResultPageProps) {
  const { gameId } = await params
  const supabase = createServerClient()

  const { data: game } = await supabase
    .from('games')
    .select('*, winner:winner_id(name, qr_code_id)')
    .eq('id', gameId)
    .single()

  const { data: players } = await supabase
    .from('players')
    .select('*')
    .eq('game_id', gameId)
    .order('hp', { ascending: false })

  const winner = game?.winner as { name: string; qr_code_id: string } | null

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        <div className="text-center">
          <p className="text-gray-400 text-sm uppercase tracking-widest mb-2">GAME OVER</p>
          <h1 className="text-5xl font-black text-white">
            {winner ? (
              <>
                <span className="text-yellow-400">{winner.name}</span>
                <br />
                <span className="text-2xl text-white font-bold">の勝利！</span>
              </>
            ) : (
              '引き分け'
            )}
          </h1>
        </div>

        {players && players.length > 0 && (
          <div className="w-full bg-gray-900 rounded-2xl p-4">
            <h2 className="text-gray-400 text-xs uppercase tracking-wider mb-3">最終スコア</h2>
            <div className="flex flex-col gap-2">
              {players.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3">
                  <span className="text-gray-500 text-sm w-4">{i + 1}</span>
                  <span className="text-white font-medium flex-1">{p.name}</span>
                  <span className={`text-sm font-mono ${p.is_alive ? 'text-green-400' : 'text-red-400'}`}>
                    HP: {p.hp}
                  </span>
                  {winner && p.name === winner.name && (
                    <span className="text-yellow-400 text-sm">👑</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <Link
          href="/lobby"
          className="w-full text-center bg-green-500 text-white font-bold text-lg py-3 rounded-xl hover:bg-green-400 transition-colors active:scale-95"
        >
          もう一度プレイ
        </Link>
      </div>
    </div>
  )
}
