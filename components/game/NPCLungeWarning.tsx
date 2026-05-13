'use client'

/**
 * NPCLungeWarning — ランジ予告フルスクリーン
 * lunge_armed_at が設定されると全プレイヤーに表示される 2 秒警告。
 */

interface Props {
  isLungeArming: boolean
  lungeProgress: number  // 0〜1
  lungeRadiusM:  number
}

export function NPCLungeWarning({ isLungeArming, lungeProgress, lungeRadiusM }: Props) {
  if (!isLungeArming) return null

  const secsLeft = Math.ceil((1 - lungeProgress) * 2)

  return (
    <div className="fixed inset-0 z-[80] pointer-events-none flex flex-col items-center justify-center gap-4">
      {/* 背景フラッシュ */}
      <div
        className="absolute inset-0 bg-red-900/60 animate-pulse"
        style={{ opacity: 0.4 + lungeProgress * 0.5 }}
      />

      {/* 警告ボックス */}
      <div className="relative z-10 bg-black/90 border-2 border-red-500 rounded-2xl px-6 py-5 flex flex-col items-center gap-3 shadow-2xl">
        <p className="text-red-400 text-6xl animate-bounce">👹</p>
        <p className="text-red-300 font-black text-2xl tracking-widest animate-pulse">
          ランジ予告！
        </p>
        <p className="text-white text-sm text-center leading-snug">
          {lungeRadiusM}m 以内なら<br />
          <span className="text-red-400 font-bold">今すぐ逃げろ！</span>
        </p>

        {/* カウントダウンバー */}
        <div className="w-full h-3 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-red-500 transition-all duration-200"
            style={{ width: `${lungeProgress * 100}%` }}
          />
        </div>
        <p className="text-white font-black text-3xl font-mono tabular-nums">
          {secsLeft}
        </p>
      </div>
    </div>
  )
}
