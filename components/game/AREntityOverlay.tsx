'use client'

/**
 * AREntityOverlay — GPS + コンパスベースの AR スプライトオーバーレイ
 *
 * カメラ映像上に NPC / ボットの存在を投影する。
 * スプライト部分は将来 <img> や Three.js に差し替え可能。
 * キーフレームは globals.css に定義済み。
 *
 * 方位計算:
 *   relAngle = ((bearing - heading) + 540) % 360 - 180  →  -180〜+180
 *   xPct     = 50 + (relAngle / (fovDeg/2)) * 50
 *   FOV 外（|relAngle| > fovDeg/2）は非表示
 *
 * 垂直位置:
 *   近い敵は下寄り（地面を向く角度）、遠い敵は地平線付近（水平視線）
 *   yPct = HORIZON_Y + ELEVATION_RANGE * (1 - distM / MAX_VISIBLE_M)
 */

import { useState, useEffect, useMemo } from 'react'
import type { Player, GameNpc } from '@/types/database'
import type { BotBehavior }     from '@/lib/game/constants'
import type { GeoPosition }     from '@/hooks/useRadar'
import { geoDistM, bearingDeg } from '@/lib/game/geo'

/** この距離を超えたエンティティは非表示 */
const MAX_VISIBLE_M  = 80
/** 射撃アニメーションを表示し続ける時間（ms） */
const RECENT_SHOT_MS = 1800
/** 遠距離エンティティの縦位置（地平線）%。上端=0、下端=100 */
const HORIZON_Y      = 42
/** 近距離になるにつれ加算される縦オフセット（px ではなく %） */
const ELEVATION_RANGE = 13

interface AREntity {
  id:          string
  hp:          number
  maxHp:       number
  distM:       number
  relAngle:    number
  type:        'npc' | 'bot'
  name?:       string
  inRange:     boolean
  behavior?:   BotBehavior | null
  lastShotAt?: string | null
}

interface Props {
  geoPos:        GeoPosition
  npc?:          GameNpc | null
  npcIsLunging?: boolean
  npcIsStunned?: boolean
  npcIsConfused?: boolean
  npcIsLockedOn?: boolean
  bots?:         Player[]
  botRangeM?:    number
  onBotTap?:     (botId: string) => void
  botDisabled?:  boolean
  /**
   * カメラ水平視野角（度）。デバイスに合わせて調整してください。
   *   iPhone 広角後カメラ: ~76°
   *   多くの Android:      60〜70°
   *   デフォルト:           60°
   */
  fovDeg?: number
}

export function AREntityOverlay({
  geoPos,
  npc,
  npcIsLunging  = false,
  npcIsStunned  = false,
  npcIsConfused = false,
  npcIsLockedOn = false,
  bots          = [],
  botRangeM     = 15,
  onBotTap,
  botDisabled   = false,
  fovDeg        = 60,
}: Props) {
  const halfFov = fovDeg / 2

  // ── エンティティ位置計算 ────────────────────────────────────────────────────
  const entities = useMemo<AREntity[]>(() => {
    const result: AREntity[] = []
    if (npc?.lat != null && npc?.lng != null && npc.hp > 0) {
      const distM = geoDistM(geoPos, { lat: npc.lat, lng: npc.lng })
      if (distM <= MAX_VISIBLE_M) {
        const bearing  = bearingDeg(geoPos, { lat: npc.lat, lng: npc.lng })
        const relAngle = ((bearing - geoPos.heading) + 540) % 360 - 180
        result.push({ id: 'npc', hp: npc.hp, maxHp: npc.max_hp, distM, relAngle, type: 'npc', inRange: false })
      }
    }
    for (const bot of bots) {
      if (!bot.is_alive || bot.lat == null || bot.lng == null) continue
      const distM = geoDistM(geoPos, { lat: bot.lat, lng: bot.lng })
      if (distM > MAX_VISIBLE_M) continue
      const bearing  = bearingDeg(geoPos, { lat: bot.lat, lng: bot.lng })
      const relAngle = ((bearing - geoPos.heading) + 540) % 360 - 180
      result.push({
        id: bot.id, hp: bot.hp, maxHp: 100, distM, relAngle, type: 'bot',
        name: bot.name, inRange: distM <= botRangeM,
        behavior: bot.bot_behavior, lastShotAt: bot.last_shot_at,
      })
    }
    return result
  }, [geoPos, npc, bots, botRangeM])

  // ── 射撃アニメーション管理 ──────────────────────────────────────────────────
  // bots の last_shot_at 変化を検知して正確に RECENT_SHOT_MS 後に解除する。
  // Date.now() をレンダー内で使うと「次のレンダーまで延長」してしまうためタイマーで管理。
  const [firedBotIds, setFiredBotIds] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    const now = Date.now()

    for (const bot of bots) {
      if (!bot.last_shot_at) continue
      const elapsed = now - new Date(bot.last_shot_at).getTime()
      if (elapsed >= RECENT_SHOT_MS) continue

      // まだ射撃アニメーション期間内 → セットに追加
      setFiredBotIds(prev => prev.has(bot.id) ? prev : new Set([...prev, bot.id]))

      // 残り時間後に削除
      const remaining = RECENT_SHOT_MS - elapsed
      timers.push(
        setTimeout(() => {
          setFiredBotIds(prev => {
            const next = new Set(prev)
            next.delete(bot.id)
            return next
          })
        }, remaining),
      )
    }

    return () => timers.forEach(clearTimeout)
  }, [bots])

  // ── レンダー ────────────────────────────────────────────────────────────────
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {entities.map(entity => {
        if (Math.abs(entity.relAngle) > halfFov) return null

        // 水平位置: FOV 内の比例配置
        const xPct = 50 + (entity.relAngle / halfFov) * 50

        // 垂直位置: 近い=下寄り（仰角小）、遠い=地平線付近（仰角大）
        const distFrac = Math.min(1, entity.distM / MAX_VISIBLE_M)
        const yPct     = HORIZON_Y + ELEVATION_RANGE * (1 - distFrac)

        // スケール: 近いほど大きい（distFrac=0→1.6倍、distFrac=1→0.4倍）
        const scaleV = Math.max(0.35, 1.6 - distFrac * 1.2)

        const hpPct      = (entity.hp / entity.maxHp) * 100
        const isNpc      = entity.type === 'npc'
        const canTap     = !isNpc && entity.inRange && !botDisabled
        const dimmed     = !isNpc && !entity.inRange
        const isRecentShot = !isNpc && firedBotIds.has(entity.id)

        // ── NPC 状態アニメーション ──────────────────────────────────────────
        const npcBodyStyle: React.CSSProperties = isNpc
          ? npcIsStunned  ? { animation: 'ar-stun 0.45s ease-in-out infinite',    filter: 'grayscale(0.8) brightness(0.6)' }
          : npcIsLunging  ? { animation: 'ar-lunge 1.1s ease-in-out infinite' }
          : npcIsConfused ? { animation: 'ar-confused 1.8s ease-in-out infinite', filter: 'hue-rotate(120deg)' }
          : {}
          : {}

        // ── ボット 状態アニメーション ────────────────────────────────────────
        const isLowHp    = !isNpc && entity.hp < 30
        const isCrew     = entity.behavior === 'crew_bot'
        const isRusher   = entity.behavior === 'rusher'
        const isDefender = entity.behavior === 'defender'

        const botBodyStyle: React.CSSProperties = !isNpc
          ? isRecentShot ? { animation: 'ar-body-recoil 0.4s ease-out' }
          : isLowHp      ? { animation: 'ar-wounded 0.75s ease-in-out infinite', filter: 'brightness(0.7) saturate(0.5)' }
          : isRusher     ? { animation: 'ar-rusher 0.55s ease-in-out infinite',  filter: 'hue-rotate(330deg) saturate(1.5)' }
          : isCrew       ? { animation: 'ar-crew 1.9s ease-in-out infinite' }
          : isDefender   ? { animation: 'ar-guard 2.2s ease-in-out infinite' }
          : {}
          : {}

        // 銃の構え角度（行動別）と待機揺れ
        const gunBaseAngle = isRusher ? -20 : isDefender ? -50 : -30
        const gunIdleAnim  = isRusher   ? 'ar-gun-rush-idle 0.6s ease-in-out infinite'
                           : isDefender ? 'ar-gun-guard-idle 2s ease-in-out infinite'
                           : undefined

        const botRoleColor = isCrew ? '#86efac' : isRusher ? '#fca5a5' : isDefender ? '#93c5fd' : '#e5e7eb'

        return (
          <div
            key={entity.id}
            className="absolute"
            style={{
              left:          `${xPct}%`,
              top:           `${yPct}%`,
              transform:     `translate(-50%, -50%) scale(${scaleV})`,
              pointerEvents: canTap ? 'auto' : 'none',
              opacity:       dimmed ? 0.45 : 1,
              transition:    'opacity 0.3s, left 0.15s, top 0.3s',
            }}
            onPointerDown={canTap ? () => onBotTap?.(entity.id) : undefined}
          >
            <div className="flex flex-col items-center select-none relative">

              {/* NPC: ロックオン脈動リング */}
              {isNpc && npcIsLockedOn && !npcIsStunned && (
                <div className="absolute rounded-full border-[3px] border-red-500"
                  style={{ inset: '-12px', animation: 'ar-lockon-ring 0.7s ease-in-out infinite' }} />
              )}

              {/* ボット: ラッシャー突入リング */}
              {!isNpc && isRusher && entity.inRange && (
                <div className="absolute rounded-full border-2 border-orange-400"
                  style={{ inset: '-10px', animation: 'ar-rush-ring 0.6s ease-in-out infinite' }} />
              )}

              {/* ボット: クルー 手を振る */}
              {!isNpc && isCrew && (
                <span className="absolute -top-5 text-lg"
                  style={{ animation: 'ar-crew-wave 1.5s ease-in-out infinite' }}>
                  👋
                </span>
              )}

              {/*
                ─── スプライト ────────────────────────────────────────────────
                差し替え例:
                  【静止画】  <img src="/images/npc.png" style={bodyStyle} ... />
                  【行動別】  <img src={`/images/bot-${entity.behavior}.png`} style={bodyStyle} />
                  【3Dモデル】<Canvas style={{ ...bodyStyle }}><NPCModel /></Canvas>
                ──────────────────────────────────────────────────────────────
              */}
              <div className="relative inline-flex items-end justify-center">

                {/* ボディ */}
                <span
                  className="drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)]"
                  style={{
                    fontSize:   isNpc ? '64px' : '48px',
                    lineHeight: 1,
                    ...(isNpc ? npcBodyStyle : botBodyStyle),
                  }}
                >
                  {isNpc ? '👹' : '🤖'}
                </span>

                {/* 銃アーム（crew_bot・NPC 以外） */}
                {!isNpc && !isCrew && (
                  <div
                    className="absolute bottom-3 -right-2"
                    style={{ transform: `rotate(${gunBaseAngle}deg)`, transformOrigin: '80% 80%' }}
                  >
                    <div style={{ animation: isRecentShot ? 'ar-gun-recoil 0.35s ease-out' : gunIdleAnim }}>
                      <span className="drop-shadow-[0_1px_6px_rgba(0,0,0,0.9)]"
                        style={{ fontSize: '22px', display: 'block', lineHeight: 1 }}>
                        🔫
                      </span>
                      {isRecentShot && (
                        <span className="absolute pointer-events-none"
                          style={{ left: '-14px', top: '2px', fontSize: '18px', lineHeight: 1,
                            animation: 'ar-muzzle 0.28s ease-out forwards' }}>
                          ✨
                        </span>
                      )}
                      {isRecentShot && (
                        <span className="absolute pointer-events-none"
                          style={{ right: '-2px', top: '4px', fontSize: '9px', lineHeight: 1,
                            animation: 'ar-shell 0.45s ease-out forwards' }}>
                          🟡
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* NPC: スタン星 */}
              {isNpc && npcIsStunned && (
                <span className="absolute -top-4 text-xl"
                  style={{ animation: 'ar-confused 1.2s ease-in-out infinite' }}>
                  ⭐
                </span>
              )}

              {/* HP バー */}
              <div className="w-14 h-1.5 bg-black/70 rounded-full overflow-hidden mt-1 shadow-lg">
                <div className="h-full rounded-full transition-all duration-300"
                  style={{
                    width:      `${hpPct}%`,
                    background: hpPct > 50 ? '#4ade80' : hpPct > 25 ? '#facc15' : '#ef4444',
                  }} />
              </div>

              {/* 名前 + 距離 */}
              <p className="text-[11px] font-bold mt-0.5 drop-shadow-[0_1px_4px_rgba(0,0,0,1)]"
                style={{ color: isNpc ? 'white' : botRoleColor }}>
                {entity.distM.toFixed(0)}m{entity.name ? ` · ${entity.name}` : ''}
              </p>

              {/* NPC 状態ラベル */}
              {isNpc && (npcIsStunned || npcIsConfused || npcIsLunging) && (
                <span className={[
                  'text-[10px] font-black mt-0.5 drop-shadow-[0_1px_3px_rgba(0,0,0,1)]',
                  npcIsStunned ? 'text-yellow-300' : npcIsLunging ? 'text-red-400 animate-pulse' : 'text-blue-300',
                ].join(' ')}>
                  {npcIsStunned ? 'STUN' : npcIsLunging ? '！突進！' : '混乱中'}
                </span>
              )}

              {/* ボット 状態ラベル */}
              {!isNpc && (
                <span className="text-[9px] font-black mt-0.5 drop-shadow-[0_1px_3px_rgba(0,0,0,1)]"
                  style={{ color: botRoleColor }}>
                  {isLowHp ? '！' : isRecentShot ? '射撃中' : isCrew ? 'ALLY' : isRusher ? 'RUSH' : isDefender ? 'GUARD' : ''}
                </span>
              )}

              {/* タップ攻撃誘導 */}
              {!isNpc && entity.inRange && !botDisabled && (
                <span className="text-[10px] text-red-400 font-black mt-0.5 animate-pulse drop-shadow-[0_1px_3px_rgba(0,0,0,1)]">
                  タップ攻撃
                </span>
              )}

            </div>
          </div>
        )
      })}
    </div>
  )
}
