'use client'

interface HitFlashProps {
  isFlashing: boolean
}

export function HitFlash({ isFlashing }: HitFlashProps) {
  if (!isFlashing) return null

  return (
    <div
      className="fixed inset-0 pointer-events-none z-50 animate-hit-flash"
      style={{ background: 'rgba(255, 0, 0, 0.45)' }}
    />
  )
}
