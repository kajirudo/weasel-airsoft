'use client'

interface TimerDisplayProps {
  remainingSeconds: number | null
}

/**
 * ゲームタイマー表示。
 * `remainingSeconds` が null のときは何も描画しない（無制限ゲーム）。
 */
export function TimerDisplay({ remainingSeconds }: TimerDisplayProps) {
  if (remainingSeconds === null) return null

  const mins = Math.floor(remainingSeconds / 60)
  const secs = remainingSeconds % 60
  const label = `${mins}:${String(secs).padStart(2, '0')}`

  const colorClass =
    remainingSeconds > 60  ? 'text-white' :
    remainingSeconds > 15  ? 'text-yellow-400' :
                             'text-red-400'

  const pulseClass = remainingSeconds <= 15 ? 'animate-pulse' : ''

  return (
    <div
      className={`
        absolute top-16 left-1/2 -translate-x-1/2
        bg-black/60 backdrop-blur-sm rounded-xl
        px-4 py-1.5 pointer-events-none z-20
        font-mono font-bold text-2xl tracking-widest
        ${colorClass} ${pulseClass}
      `}
      aria-label={`残り時間 ${label}`}
    >
      {label}
    </div>
  )
}
