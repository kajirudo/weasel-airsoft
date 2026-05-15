'use client'

/**
 * ReloadOverlay — 画面下部にリロード中の演出を表示
 */

interface Props {
  visible:  boolean
  progress: number   // 0..1
}

export function ReloadOverlay({ visible, progress }: Props) {
  if (!visible) return null

  return (
    <div className="absolute bottom-28 left-0 right-0 flex justify-center pointer-events-none z-[63]">
      <div className="bg-black/80 border border-amber-600/50 rounded-xl px-5 py-2 flex flex-col items-center gap-1.5 min-w-[180px]">
        <p className="text-amber-300 text-xs font-bold tracking-widest animate-pulse">
          ⟳ RELOADING
        </p>
        <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-500 rounded-full"
            style={{ width: `${progress * 100}%`, transition: 'width 0.1s linear' }}
          />
        </div>
      </div>
    </div>
  )
}
