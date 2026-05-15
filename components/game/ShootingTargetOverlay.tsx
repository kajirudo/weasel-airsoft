'use client'

/**
 * ShootingTargetOverlay — シューティングモード AR オーバーレイ
 *
 * AREntityOverlay と同じ方位ベース投影を使うが、対象は shooting_targets。
 * - kind ごとにスプライト・色・サイズが変わる
 * - runner / bonus は drift_dps で時間とともに方位が動く
 * - tough は HP バー表示
 * - FOV 外はターゲット種別ごとに画面端インジケーター
 */

import type { ShootingTarget } from '@/types/database'
import type { GeoPosition }    from '@/hooks/useRadar'
import { normAngle }           from '@/lib/game/geo'
import {
  SHOOTING_TARGET_KINDS, SHOOTING_DEFAULT_FOV_DEG, SHOOTING_INDOOR, SHOOTING_OUTDOOR,
} from '@/lib/game/constants'

const HORIZON_Y       = 42
const ELEVATION_RANGE = 16

interface Props {
  geoPos:       GeoPosition
  targets:      ShootingTarget[]
  environment:  'indoor' | 'outdoor'
  aimedId:      string | null
  /** UI 表示用の now (useShootingMode から受け取る) */
  now:          number
  fovDeg?:      number
}

export function ShootingTargetOverlay({
  geoPos, targets, environment, aimedId, now,
  fovDeg = SHOOTING_DEFAULT_FOV_DEG,
}: Props) {
  const halfFov = fovDeg / 2
  const maxR    = environment === 'indoor' ? SHOOTING_INDOOR.maxRangeM : SHOOTING_OUTDOOR.maxRangeM

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {targets.map(t => {
        if (t.killed_at) return null
        const expiresAt = new Date(t.expires_at).getTime()
        if (expiresAt <= now) return null

        const elapsed  = (now - new Date(t.spawn_at).getTime()) / 1000
        const curBear  = (t.bearing_deg + t.drift_dps * elapsed + 360) % 360
        const relAngle = normAngle(curBear - geoPos.heading)

        const cfg     = SHOOTING_TARGET_KINDS[t.kind]
        const lifeMs      = expiresAt - now
        const totalLifeMs = Math.max(1, expiresAt - new Date(t.spawn_at).getTime())
        const lifePct     = Math.max(0, lifeMs / totalLifeMs)

        // FOV 外 → 画面端インジケーター
        if (Math.abs(relAngle) > halfFov) {
          const isRight = relAngle > 0
          return (
            <div
              key={t.id}
              className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center"
              style={{ [isRight ? 'right' : 'left']: '10px' }}
            >
              <span className="text-xl drop-shadow-[0_0_4px_rgba(0,0,0,1)]"
                    style={{ color: cfg.color }}>
                {isRight ? '▶' : '◀'}
              </span>
              <span className="text-lg drop-shadow-[0_0_4px_rgba(0,0,0,1)]">{cfg.emoji}</span>
              <span className="text-[9px] font-bold drop-shadow-[0_1px_3px_rgba(0,0,0,1)]"
                    style={{ color: cfg.color }}>
                {t.dist_m.toFixed(0)}m
              </span>
            </div>
          )
        }

        // FOV 内 → スプライト描画
        const xPct     = 50 + (relAngle / halfFov) * 50
        const distFrac = Math.min(1, t.dist_m / maxR)
        const yPct     = HORIZON_Y + ELEVATION_RANGE * (1 - distFrac)
        const scaleV   = Math.max(0.4, (1.6 - distFrac * 1.0) * t.size_factor)

        const isAimed  = aimedId === t.id
        const fontSize = environment === 'indoor' ? 64 : 48

        return (
          <div
            key={t.id}
            className="absolute"
            style={{
              left:       `${xPct}%`,
              top:        `${yPct}%`,
              transform:  `translate(-50%, -50%) scale(${scaleV})`,
              transition: 'left 0.12s linear, top 0.3s',
            }}
          >
            <div className="flex flex-col items-center select-none relative">
              {/* ロックオン（エイム合致）リング */}
              {isAimed && (
                <div
                  className="absolute rounded-full"
                  style={{
                    inset: '-10px',
                    border: `3px solid ${cfg.color}`,
                    animation: 'ar-lockon-ring 0.55s ease-in-out infinite',
                  }}
                />
              )}

              {/* スプライト */}
              <span
                className="drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)]"
                style={{
                  fontSize:   `${fontSize}px`,
                  lineHeight: 1,
                  filter:     isAimed ? 'brightness(1.4) drop-shadow(0 0 12px ' + cfg.color + ')' : undefined,
                }}
              >
                {cfg.emoji}
              </span>

              {/* tough は HP バー */}
              {t.kind === 'tough' && t.max_hp > 1 && (
                <div className="w-12 h-1.5 bg-black/70 rounded-full overflow-hidden mt-1 shadow-lg">
                  <div
                    className="h-full rounded-full transition-all duration-200"
                    style={{
                      width: `${(t.hp / t.max_hp) * 100}%`,
                      background: cfg.color,
                    }}
                  />
                </div>
              )}

              {/* 寿命プログレス（細い線） */}
              <div className="w-10 h-0.5 bg-black/40 rounded-full overflow-hidden mt-0.5">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${lifePct * 100}%`, background: cfg.color, opacity: 0.6 }}
                />
              </div>

              {/* 距離 + スコア */}
              <p className="text-[10px] font-bold mt-0.5 drop-shadow-[0_1px_4px_rgba(0,0,0,1)]"
                 style={{ color: cfg.color }}>
                {t.dist_m.toFixed(0)}m · {t.base_score}
              </p>

              {/* ラベル */}
              <span className="text-[9px] font-black drop-shadow-[0_1px_3px_rgba(0,0,0,1)]"
                    style={{ color: cfg.color }}>
                {cfg.label}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
