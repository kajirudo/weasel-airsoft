'use client'

/**
 * ReloadOverlay — リロード中を示す画面下端バー。
 * 表示面積を最小限にして視界を塞がないようにする。
 */

interface Props {
  visible:  boolean
  progress: number   // 0..1
}

export function ReloadOverlay({ visible, progress }: Props) {
  if (!visible) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[70] pointer-events-none">
      {/* ラベル */}
      <div className="flex justify-center mb-0.5">
        <span className="text-[9px] font-bold text-amber-400/80 tracking-widest">
          ⟳ RELOADING
        </span>
      </div>
      {/* プログレスバー（3px 細め） */}
      <div className="h-[3px] bg-gray-800/80 w-full">
        <div
          className="h-full bg-amber-500"
          style={{ width: `${progress * 100}%`, transition: 'width 0.1s linear' }}
        />
      </div>
    </div>
  )
}
