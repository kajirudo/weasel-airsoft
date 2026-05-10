import { LobbyForm } from '@/components/lobby/LobbyForm'

interface JoinPageProps {
  params: Promise<{ code: string }>
}

export default async function JoinPage({ params }: JoinPageProps) {
  const { code } = await params
  const displayCode = code.toUpperCase()

  return (
    <main className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4 gap-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-black text-white tracking-tight">
          WEASEL AIRSOFT
        </h1>
        <p className="text-gray-400 text-sm">ゲームに参加する</p>
        <div className="inline-block bg-gray-900 border border-gray-700 rounded-xl px-6 py-3 mt-2">
          <p className="text-xs text-gray-500 mb-1">ゲームコード</p>
          <p className="text-green-400 font-mono font-black text-4xl tracking-[0.3em]">
            {displayCode}
          </p>
        </div>
      </div>

      <LobbyForm initialCode={displayCode} />
    </main>
  )
}
