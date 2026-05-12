'use client'

import type { FlashColor } from '@/hooks/useHitEffect'

interface HitFlashProps {
  isFlashing: boolean
  color?:     FlashColor   // 'red'（被弾）| 'blue'（ストーム）
}

const FLASH_STYLES: Record<FlashColor, { bg: string; shadow: string }> = {
  red:  {
    bg:     'rgba(255, 0, 0, 0.45)',
    shadow: 'inset 0 0 60px 20px rgba(220,38,38,0.6)',
  },
  blue: {
    bg:     'rgba(30, 80, 220, 0.35)',
    shadow: 'inset 0 0 80px 30px rgba(59,130,246,0.55)',
  },
}

export function HitFlash({ isFlashing, color = 'red' }: HitFlashProps) {
  if (!isFlashing) return null

  const style = FLASH_STYLES[color]

  return (
    <>
      <div
        className="fixed inset-0 pointer-events-none z-50 animate-hit-flash"
        style={{ background: style.bg }}
      />
      {/* 画面四辺のビネット強調 */}
      <div
        className="fixed inset-0 pointer-events-none z-50 animate-hit-flash"
        style={{ boxShadow: style.shadow }}
      />
      {/* ストームの場合は「STORM DAMAGE」テキスト */}
      {color === 'blue' && (
        <div className="fixed inset-0 pointer-events-none z-50 flex items-start justify-center pt-20 animate-hit-flash">
          <span className="text-blue-300 font-black text-lg tracking-widest drop-shadow-lg">
            ⚡ STORM DAMAGE
          </span>
        </div>
      )}
    </>
  )
}
