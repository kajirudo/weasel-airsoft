import { LobbyForm }          from '@/components/lobby/LobbyForm'
import { TutorialOverlay }    from '@/components/lobby/TutorialOverlay'
import { MarkerModeSelector } from '@/components/lobby/MarkerModeSelector'

export default function LobbyPage() {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        <div className="text-center">
          <h1 className="text-4xl font-black tracking-tight text-white">
            WEASEL<span className="text-green-400"> AIRSOFT</span>
          </h1>
          <p className="text-gray-400 mt-2 text-sm">AR レーザータグゲーム</p>
        </div>

        <LobbyForm />

        {/* マーカーモード選択（QR / ArUco）*/}
        <div className="w-full">
          <MarkerModeSelector />
        </div>
      </div>

      {/* 初回のみ表示されるチュートリアル */}
      <TutorialOverlay />
    </div>
  )
}
