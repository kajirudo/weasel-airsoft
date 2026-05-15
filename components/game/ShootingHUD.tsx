'use client'

/**
 * ShootingHUD — シューティングモードのミニ HUD（左上コーナー）
 *
 * 画面中央を塞がないよう最小面積に抑える。
 * タップ射撃を妨げないよう pointer-events-none。
 */

import type { ShootingEnvironment } from '@/types/database'

interface Props {
  environment:    ShootingEnvironment
  score:          number
  combo:          number
  maxCombo:       number
  ammo:           number
  magSize:        number
  isReloading:    boolean
  targetsActive:  number
}

export function ShootingHUD({
  environment, score, combo, maxCombo,
  ammo, magSize, isReloading, targetsActive,
}: Props) {
  const envLabel = environment === 'indoor' ? '🏠 INDOOR' : '🌲 OUT'
  const envColor = environment === 'indoor'
    ? 'bg-orange-900/60 border-orange-600 text-orange-300'
    : 'bg-blue-900/60 border-blue-600 text-blue-300'

  return (
    <div className="fixed top-4 left-4 z-[65] pointer-events-none flex flex-col gap-1.5">
      {/* 環境バッジ + ターゲット数 */}
      <div className="flex items-center gap-1.5">
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${envColor}`}>
          {envLabel}
        </span>
        <span className="text-gray-400 text-[9px] font-mono bg-black/50 px-1.5 py-0.5 rounded-full">
          TGT {targetsActive}
        </span>
      </div>

      {/* スコア */}
      <p className="text-amber-300 text-xl font-black font-mono tabular-nums leading-none drop-shadow-[0_1px_4px_rgba(0,0,0,1)]">
        {score.toLocaleString()}
      </p>

      {/* コンボ */}
      {combo >= 2 && (
        <p className={`text-[10px] font-bold leading-none ${combo >= 5 ? 'text-red-400 animate-pulse' : 'text-yellow-400'}`}>
          ×{combo} COMBO
        </p>
      )}

      {/* 弾倉ドット */}
      <div className="flex gap-0.5 flex-wrap max-w-[80px]">
        {Array.from({ length: magSize }).map((_, i) => (
          <span
            key={i}
            className={[
              'block w-1.5 h-2.5 rounded-sm',
              isReloading
                ? 'bg-amber-600/40'
                : i < ammo
                  ? 'bg-amber-400 shadow-[0_0_2px_rgba(251,191,36,0.5)]'
                  : 'bg-gray-700',
            ].join(' ')}
          />
        ))}
      </div>

      {/* MAX コンボ */}
      {maxCombo > 0 && (
        <p className="text-[8px] text-gray-500 font-mono leading-none">
          BEST ×{maxCombo}
        </p>
      )}
    </div>
  )
}
