'use client'

/**
 * AREntityOverlay — GPS + コンパスベースの AR スプライトオーバーレイ
 *
 * カメラ映像上に NPC / ボットの存在を投影する。
 * スプライト部分は将来 <img> や Three.js に差し替え可能。
 *
 * 方位計算:
 *   relAngle = ((bearing - heading) + 540) % 360 - 180  →  -180〜+180
 *   xPct     = 50 + (relAngle / (FOV/2)) * 50
 *   FOV 外（|relAngle| > FOV/2）は非表示
 */

import { useMemo } from 'react'
import type { Player, GameNpc } from '@/types/database'
import type { BotBehavior }     from '@/lib/game/constants'
import type { GeoPosition }     from '@/hooks/useRadar'
import { geoDistM, bearingDeg } from '@/lib/game/geo'

const CAMERA_FOV_DEG = 60
const MAX_VISIBLE_M  = 80
const RECENT_SHOT_MS = 1800

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
  geoPos:           GeoPosition
  npc?:             GameNpc | null
  npcIsLunging?:    boolean
  npcIsStunned?:    boolean
  npcIsConfused?:   boolean
  npcIsLockedOn?:   boolean
  bots?:            Player[]
  botRangeM?:       number
  onBotTap?:        (botId: string) => void
  botDisabled?:     boolean
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
}: Props) {
  const halfFov = CAMERA_FOV_DEG / 2

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

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">

      <style>{`
        /* ── NPC ─────────────────────────────────────────────────────────── */
        @keyframes ar-lunge {
          0%   { transform: scale(1)   translateY(0px);  opacity: 1; }
          30%  { transform: scale(1.4) translateY(20px); opacity: 1; }
          65%  { transform: scale(2.2) translateY(60px); opacity: 0.85; }
          80%  { transform: scale(2.5) translateY(75px); opacity: 0.6; }
          100% { transform: scale(1)   translateY(0px);  opacity: 1; }
        }
        @keyframes ar-stun {
          0%,100% { transform: rotate(-12deg) translateY(0px); }
          25%     { transform: rotate(12deg)  translateY(-4px); }
          50%     { transform: rotate(-8deg)  translateY(2px); }
          75%     { transform: rotate(8deg)   translateY(-2px); }
        }
        @keyframes ar-confused {
          0%,100% { transform: translateY(0px)  rotate(-4deg); }
          33%     { transform: translateY(-10px) rotate(4deg); }
          66%     { transform: translateY(5px)   rotate(-2deg); }
        }
        @keyframes ar-lockon-ring {
          0%,100% { transform: scale(1);    opacity: 0.9; }
          50%     { transform: scale(1.25); opacity: 0.4; }
        }

        /* ── ボット ボディ ───────────────────────────────────────────────── */
        @keyframes ar-body-recoil {
          0%   { transform: translateX(4px) rotate(6deg); }
          35%  { transform: translateX(-2px) rotate(-2deg); }
          100% { transform: translateX(0) rotate(0deg); }
        }
        @keyframes ar-rusher {
          0%,100% { transform: translateY(0px) rotate(-7deg) scaleX(1.05); }
          40%     { transform: translateY(-6px) rotate(5deg) scaleX(0.95); }
          70%     { transform: translateY(3px)  rotate(-4deg) scaleX(1.08); }
        }
        @keyframes ar-crew {
          0%,100% { transform: translateY(0px) rotate(-3deg); }
          50%     { transform: translateY(-9px) rotate(3deg); }
        }
        @keyframes ar-crew-wave {
          0%,100% { transform: rotate(0deg) translateX(0px); }
          25%     { transform: rotate(20deg) translateX(2px); }
          75%     { transform: rotate(-10deg) translateX(-1px); }
        }
        @keyframes ar-guard {
          0%,100% { transform: translateX(-4px) rotate(-2deg); }
          50%     { transform: translateX(4px)  rotate(2deg); }
        }
        @keyframes ar-wounded {
          0%     { transform: rotate(-14deg) translateY(0px); }
          20%    { transform: rotate(9deg)   translateY(-3px); }
          45%    { transform: rotate(-11deg) translateY(2px); }
          70%    { transform: rotate(7deg)   translateY(-2px); }
          100%   { transform: rotate(-14deg) translateY(0px); }
        }

        /* ── ボット 銃アーム ─────────────────────────────────────────────── */
        /* 銃のリコイル: ローカル座標で後退してから戻る */
        @keyframes ar-gun-recoil {
          0%   { transform: translateX(0px)  translateY(0px) rotate(0deg);   }
          18%  { transform: translateX(-8px) translateY(-5px) rotate(18deg); }
          45%  { transform: translateX(3px)  translateY(1px) rotate(-4deg);  }
          70%  { transform: translateX(-1px) translateY(0px) rotate(2deg);   }
          100% { transform: translateX(0px)  translateY(0px) rotate(0deg);   }
        }
        /* 銃の待機揺れ（ラッシャー: 前傾ぎみに） */
        @keyframes ar-gun-rush-idle {
          0%,100% { transform: rotate(-8deg) translateY(0px); }
          50%     { transform: rotate(6deg)  translateY(-3px); }
        }
        /* 銃の待機揺れ（ガード: ゆっくり） */
        @keyframes ar-gun-guard-idle {
          0%,100% { transform: translateX(-2px); }
          50%     { transform: translateX(2px); }
        }
        /* マズルフラッシュ: 一瞬拡大して消える */
        @keyframes ar-muzzle {
          0%   { transform: scale(0.3) rotate(-10deg); opacity: 1; }
          25%  { transform: scale(1.4) rotate(5deg);  opacity: 1; }
          60%  { transform: scale(1.1) rotate(-3deg); opacity: 0.6; }
          100% { transform: scale(0.2) rotate(10deg); opacity: 0; }
        }
        /* 薬莢排出: 右上へ飛んで消える */
        @keyframes ar-shell {
          0%   { transform: translate(0px, 0px) rotate(0deg); opacity: 1; }
          100% { transform: translate(18px, -22px) rotate(200deg); opacity: 0; }
        }
        /* ラッシャー突入リング */
        @keyframes ar-rush-ring {
          0%,100% { transform: scale(1);   opacity: 0.6; }
          50%     { transform: scale(1.2); opacity: 0.2; }
        }
      `}</style>

      {entities.map(entity => {
        if (Math.abs(entity.relAngle) > halfFov) return null

        const xPct   = 50 + (entity.relAngle / halfFov) * 50
        const scale  = Math.max(0.35, 1.6 - (entity.distM / MAX_VISIBLE_M) * 1.2)
        const hpPct  = (entity.hp / entity.maxHp) * 100
        const isNpc  = entity.type === 'npc'
        const canTap = !isNpc && entity.inRange && !botDisabled
        const dimmed = !isNpc && !entity.inRange

        // ── NPC 状態 ────────────────────────────────────────────────────────
        const npcBodyStyle: React.CSSProperties = isNpc
          ? npcIsStunned  ? { animation: 'ar-stun 0.45s ease-in-out infinite', filter: 'grayscale(0.8) brightness(0.6)' }
          : npcIsLunging  ? { animation: 'ar-lunge 1.1s ease-in-out infinite' }
          : npcIsConfused ? { animation: 'ar-confused 1.8s ease-in-out infinite', filter: 'hue-rotate(120deg)' }
          : {}
          : {}

        // ── ボット 状態 ──────────────────────────────────────────────────────
        const now          = Date.now()
        const isRecentShot = !isNpc && entity.lastShotAt != null
                             && now - new Date(entity.lastShotAt).getTime() < RECENT_SHOT_MS
        const isLowHp    = !isNpc && entity.hp < 30
        const isCrew     = entity.behavior === 'crew_bot'
        const isRusher   = entity.behavior === 'rusher'
        const isDefender = entity.behavior === 'defender'

        // ボディアニメーション（射撃中は体のリコイル優先）
        const botBodyStyle: React.CSSProperties = !isNpc
          ? isRecentShot ? { animation: 'ar-body-recoil 0.4s ease-out' }
          : isLowHp      ? { animation: 'ar-wounded 0.75s ease-in-out infinite', filter: 'brightness(0.7) saturate(0.5)' }
          : isRusher     ? { animation: 'ar-rusher 0.55s ease-in-out infinite', filter: 'hue-rotate(330deg) saturate(1.5)' }
          : isCrew       ? { animation: 'ar-crew 1.9s ease-in-out infinite' }
          : isDefender   ? { animation: 'ar-guard 2.2s ease-in-out infinite' }
          : {}
          : {}

        // 銃の角度（行動別の構え）: 右向き🔫の barrel=右 → rotate で仰角変化
        const gunBaseAngle = isRusher ? -20 : isDefender ? -50 : isCrew ? -75 : -30  // deg
        // 銃の待機アニメーション
        const gunIdleAnim  = isRusher   ? 'ar-gun-rush-idle 0.6s ease-in-out infinite'
                           : isDefender ? 'ar-gun-guard-idle 2s ease-in-out infinite'
                           : undefined

        const botRoleColor = isCrew ? '#86efac' : isRusher ? '#fca5a5' : isDefender ? '#93c5fd' : '#e5e7eb'

        return (
          <div
            key={entity.id}
            className="absolute"
            style={{
              left:         `${xPct}%`,
              top:          '42%',
              transform:    `translate(-50%, -50%) scale(${scale})`,
              pointerEvents: canTap ? 'auto' : 'none',
              opacity:       dimmed ? 0.45 : 1,
              transition:    'opacity 0.3s, left 0.15s',
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
                ボディ・銃ともに <img> や 3D モデルに差し替え可能。
                ボディ: style={bodyStyle} を渡せばアニメーションが引き継がれる。
                銃:     gunBaseAngle と gunRecoilStyle を活用して位置・リコイルを制御。
                ──────────────────────────────────────────────────────────────
              */}

              {/* ─ ボディ + 銃の合成スプライト ─ */}
              <div className="relative inline-flex items-end justify-center">

                {/* ボディ */}
                <span
                  className="drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)]"
                  style={{ fontSize: isNpc ? '64px' : '48px', lineHeight: 1, ...(isNpc ? npcBodyStyle : botBodyStyle) }}
                >
                  {isNpc ? '👹' : '🤖'}
                </span>

                {/* 銃アーム（crew_bot 以外、NPC 以外） */}
                {!isNpc && !isCrew && (
                  // 外側 div: 行動別の構え角度（静的）
                  <div
                    className="absolute bottom-3 -right-2"
                    style={{ transform: `rotate(${gunBaseAngle}deg)`, transformOrigin: '80% 80%' }}
                  >
                    {/* 内側 div: 射撃リコイルまたは待機揺れ（動的） */}
                    <div style={{ animation: isRecentShot ? 'ar-gun-recoil 0.35s ease-out' : gunIdleAnim }}>

                      {/* 銃本体 */}
                      <span
                        className="drop-shadow-[0_1px_6px_rgba(0,0,0,0.9)]"
                        style={{ fontSize: '22px', display: 'block', lineHeight: 1 }}
                      >
                        🔫
                      </span>

                      {/* マズルフラッシュ（射撃直後） */}
                      {isRecentShot && (
                        <span
                          className="absolute pointer-events-none"
                          style={{
                            left: '-14px', top: '2px',
                            fontSize: '18px', lineHeight: 1,
                            animation: 'ar-muzzle 0.28s ease-out forwards',
                          }}
                        >
                          ✨
                        </span>
                      )}

                      {/* 薬莢排出（射撃直後） */}
                      {isRecentShot && (
                        <span
                          className="absolute pointer-events-none"
                          style={{
                            right: '-2px', top: '4px',
                            fontSize: '9px', lineHeight: 1,
                            animation: 'ar-shell 0.45s ease-out forwards',
                          }}
                        >
                          🟡
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
              {/* ─────────────────────────────────────────────────────────── */}

              {/* NPC: スタン星 */}
              {isNpc && npcIsStunned && (
                <span className="absolute -top-4 text-xl"
                  style={{ animation: 'ar-confused 1.2s ease-in-out infinite' }}>
                  ⭐
                </span>
              )}

              {/* HP バー */}
              <div className="w-14 h-1.5 bg-black/70 rounded-full overflow-hidden mt-1 shadow-lg">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width:      `${hpPct}%`,
                    background: hpPct > 50 ? '#4ade80' : hpPct > 25 ? '#facc15' : '#ef4444',
                  }}
                />
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
                  {isLowHp      ? '！' :
                   isRecentShot ? '射撃中' :
                   isCrew       ? 'ALLY' :
                   isRusher     ? 'RUSH' :
                   isDefender   ? 'GUARD' : ''}
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
