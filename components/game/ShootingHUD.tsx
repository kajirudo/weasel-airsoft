'use client'

/**
 * ShootingHUD — シューティングモードの上部 HUD。
 *
 * 表示:
 *   - スコア（大型）
 *   - コンボ・最大コンボ
 *   - 残弾ドット + リロード進捗
 *   - 環境バッジ
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
  reloadProgress: number   // 0..1
  targetsActive:  number
  onManualReload: () => void
}

export function ShootingHUD({
  environment, score, combo, maxCombo,
  ammo, magSize, isReloading, reloadProgress,
  targetsActive, onManualReload,
}: Props) {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[65] pointer-events-none">
      <div className="bg-black/75 backdrop-blur-sm rounded-xl px-4 py-2 flex flex-col items-center gap-1 min-w-[220px]">
        {/* 環境バッジ + アクティブ数 */}
        <div className="flex items-center gap-2 w-full justify-between">
          <span className={[
            'text-[10px] font-bold px-2 py-0.5 rounded-full border',
            environment === 'indoor'
              ? 'bg-orange-900/50 border-orange-600 text-orange-300'
              : 'bg-blue-900/50 border-blue-600 text-blue-300',
          ].join(' ')}>
            {environment === 'indoor' ? '🏠 INDOOR' : '🌲 OUTDOOR'}
          </span>
          <span className="text-gray-400 text-[10px] font-mono">
            TGT {targetsActive}
          </span>
        </div>

        {/* スコア */}
        <p className="text-amber-300 text-2xl font-black font-mono tabular-nums leading-none">
          {score.toLocaleString()}
        </p>

        {/* コンボ */}
        <div className="flex items-center gap-2 text-[10px]">
          <span className={combo >= 3 ? 'text-red-400 font-bold animate-pulse' : 'text-gray-400'}>
            COMBO ×{combo}
          </span>
          <span className="text-gray-600">/ MAX ×{maxCombo}</span>
        </div>

        {/* 弾倉表示 */}
        <button
          onClick={onManualReload}
          disabled={isReloading || ammo >= magSize}
          className="pointer-events-auto mt-1 w-full flex flex-col items-center gap-1 disabled:opacity-100"
        >
          {/* 弾ドット */}
          <div className="flex gap-0.5">
            {Array.from({ length: magSize }).map((_, i) => (
              <span
                key={i}
                className={[
                  'block w-1.5 h-3 rounded-sm transition-all',
                  i < ammo ? 'bg-amber-400 shadow-[0_0_3px_rgba(251,191,36,0.6)]' : 'bg-gray-700',
                ].join(' ')}
              />
            ))}
          </div>

          {/* リロード中のプログレスバー */}
          {isReloading ? (
            <div className="w-full h-1 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 transition-all duration-100"
                style={{ width: `${reloadProgress * 100}%` }}
              />
            </div>
          ) : (
            <span className="text-[9px] text-gray-500 font-mono">
              {ammo >= magSize ? 'FULL' : 'TAP TO RELOAD'}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}
