'use client'

/**
 * AREntityOverlay — GPS + コンパスベースの AR スプライトオーバーレイ
 *
 * カメラ映像上に NPC / ボットの存在を投影する。
 * スプライト部分（絵文字）は将来 <img> や Three.js に差し替え可能。
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

/** カメラ水平視野角（度）— デバイスに合わせて調整可 */
const CAMERA_FOV_DEG = 60
/** この距離を超えたエンティティは非表示 */
const MAX_VISIBLE_M  = 80
/** この時間内に last_shot_at が更新されたら「射撃中」とみなす（ms） */
const RECENT_SHOT_MS = 1800

interface AREntity {
  id:          string
  hp:          number
  maxHp:       number
  distM:       number
  relAngle:    number            // コンパス方位との差 -180〜+180
  type:        'npc' | 'bot'
  name?:       string
  inRange:     boolean           // ボット攻撃射程内か
  // ボット専用
  behavior?:   BotBehavior | null
  lastShotAt?: string | null
}

interface Props {
  geoPos:           GeoPosition
  /** ハンティングモード NPC */
  npc?:             GameNpc | null
  /** ランジ予告中（lunge_fire_at > now） */
  npcIsLunging?:    boolean
  /** スタン中（stun_until > now） */
  npcIsStunned?:    boolean
  /** 混乱中（confused_until > now） */
  npcIsConfused?:   boolean
  /** NPC が自分をロックオン中 */
  npcIsLockedOn?:   boolean
  /** ソロプレイ ボット一覧 */
  bots?:            Player[]
  /** ボット攻撃射程（m） */
  botRangeM?:       number
  /** ボットスプライトをタップしたときのコールバック */
  onBotTap?:        (botId: string) => void
  /** ボット攻撃クールダウン中は true */
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

    // ── NPC ──────────────────────────────────────────────────────────────────
    if (npc?.lat != null && npc?.lng != null && npc.hp > 0) {
      const distM = geoDistM(geoPos, { lat: npc.lat, lng: npc.lng })
      if (distM <= MAX_VISIBLE_M) {
        const bearing  = bearingDeg(geoPos, { lat: npc.lat, lng: npc.lng })
        const relAngle = ((bearing - geoPos.heading) + 540) % 360 - 180
        result.push({
          id: 'npc', hp: npc.hp, maxHp: npc.max_hp,
          distM, relAngle, type: 'npc', inRange: false,
        })
      }
    }

    // ── ボット ────────────────────────────────────────────────────────────────
    for (const bot of bots) {
      if (!bot.is_alive || bot.lat == null || bot.lng == null) continue
      const distM = geoDistM(geoPos, { lat: bot.lat, lng: bot.lng })
      if (distM > MAX_VISIBLE_M) continue
      const bearing  = bearingDeg(geoPos, { lat: bot.lat, lng: bot.lng })
      const relAngle = ((bearing - geoPos.heading) + 540) % 360 - 180
      result.push({
        id: bot.id, hp: bot.hp, maxHp: 100,
        distM, relAngle, type: 'bot', name: bot.name,
        inRange:     distM <= botRangeM,
        behavior:    bot.bot_behavior,
        lastShotAt:  bot.last_shot_at,
      })
    }

    return result
  }, [geoPos, npc, bots, botRangeM])

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">

      {/* ── アニメーション keyframes ─────────────────────────────────────────── */}
      <style>{`
        /* NPC: ランジ（突進） */
        @keyframes ar-lunge {
          0%   { transform: scale(1)   translateY(0px);  opacity: 1; }
          30%  { transform: scale(1.4) translateY(20px); opacity: 1; }
          65%  { transform: scale(2.2) translateY(60px); opacity: 0.85; }
          80%  { transform: scale(2.5) translateY(75px); opacity: 0.6; }
          100% { transform: scale(1)   translateY(0px);  opacity: 1; }
        }
        /* NPC: スタン */
        @keyframes ar-stun {
          0%,100% { transform: rotate(-12deg) translateY(0px); }
          25%     { transform: rotate(12deg)  translateY(-4px); }
          50%     { transform: rotate(-8deg)  translateY(2px); }
          75%     { transform: rotate(8deg)   translateY(-2px); }
        }
        /* NPC: 混乱 / ボット: クルー待機 */
        @keyframes ar-confused {
          0%,100% { transform: translateY(0px)   rotate(-4deg); }
          33%     { transform: translateY(-10px)  rotate(4deg); }
          66%     { transform: translateY(5px)    rotate(-2deg); }
        }
        /* NPC: ロックオン脈動リング */
        @keyframes ar-lockon-ring {
          0%,100% { transform: scale(1);    opacity: 0.9; }
          50%     { transform: scale(1.25); opacity: 0.4; }
        }

        /* ボット: 射撃フラッシュ */
        @keyframes ar-bot-shoot {
          0%   { transform: scale(1)   rotate(0deg);  filter: brightness(1); }
          12%  { transform: scale(1.5) rotate(-6deg); filter: brightness(2.5) sepia(1) saturate(4) hue-rotate(-10deg); }
          30%  { transform: scale(0.9) rotate(4deg);  filter: brightness(1.4); }
          55%  { transform: scale(1.1) rotate(-2deg); filter: brightness(1); }
          100% { transform: scale(1)   rotate(0deg);  filter: brightness(1); }
        }
        /* ボット: ラッシャー（常時アグレッシブ） */
        @keyframes ar-rusher {
          0%,100% { transform: translateY(0px) rotate(-7deg) scaleX(1.05); }
          40%     { transform: translateY(-6px) rotate(5deg) scaleX(0.95); }
          70%     { transform: translateY(3px) rotate(-4deg) scaleX(1.08); }
        }
        /* ボット: クルーボット（協力・待機ボブ） */
        @keyframes ar-crew {
          0%,100% { transform: translateY(0px) rotate(-3deg); }
          50%     { transform: translateY(-9px) rotate(3deg); }
        }
        /* ボット: クルーボット 手を振る */
        @keyframes ar-crew-wave {
          0%,100% { transform: rotate(0deg) translateX(0px); }
          25%     { transform: rotate(20deg) translateX(2px); }
          75%     { transform: rotate(-10deg) translateX(-1px); }
        }
        /* ボット: ディフェンダー（左右ガード） */
        @keyframes ar-guard {
          0%,100% { transform: translateX(-4px) rotate(-2deg); }
          50%     { transform: translateX(4px)  rotate(2deg); }
        }
        /* ボット: 瀕死（よろめき） */
        @keyframes ar-wounded {
          0%     { transform: rotate(-14deg) translateY(0px); }
          20%    { transform: rotate(9deg)  translateY(-3px); }
          45%    { transform: rotate(-11deg) translateY(2px); }
          70%    { transform: rotate(7deg)  translateY(-2px); }
          100%   { transform: rotate(-14deg) translateY(0px); }
        }
        /* ボット: ラッシャー突入リング（射程内） */
        @keyframes ar-rush-ring {
          0%,100% { transform: scale(1);    opacity: 0.6; }
          50%     { transform: scale(1.2);  opacity: 0.2; }
        }
      `}</style>

      {entities.map(entity => {
        if (Math.abs(entity.relAngle) > halfFov) return null

        const xPct   = 50 + (entity.relAngle / halfFov) * 50
        const scale  = Math.max(0.35, 1.6 - (entity.distM / MAX_VISIBLE_M) * 1.2)
        const hpPct  = (entity.hp / entity.maxHp) * 100
        const canTap = entity.type === 'bot' && entity.inRange && !botDisabled
        const dimmed = entity.type === 'bot' && !entity.inRange

        // ── NPC アニメーション ────────────────────────────────────────────────
        const isNpc = entity.type === 'npc'
        const npcSpriteStyle: React.CSSProperties = isNpc
          ? npcIsStunned  ? { animation: 'ar-stun 0.45s ease-in-out infinite',    filter: 'grayscale(0.8) brightness(0.6)' }
          : npcIsLunging  ? { animation: 'ar-lunge 1.1s ease-in-out infinite' }
          : npcIsConfused ? { animation: 'ar-confused 1.8s ease-in-out infinite', filter: 'hue-rotate(120deg)' }
          : {}
          : {}

        // ── ボットアニメーション ──────────────────────────────────────────────
        const now = Date.now()
        const isRecentShot = !isNpc && entity.lastShotAt != null
          && now - new Date(entity.lastShotAt).getTime() < RECENT_SHOT_MS
        const isLowHp      = !isNpc && entity.hp < 30
        const isCrew       = entity.behavior === 'crew_bot'
        const isRusher     = entity.behavior === 'rusher'
        const isDefender   = entity.behavior === 'defender'

        const botSpriteStyle: React.CSSProperties = !isNpc
          ? isRecentShot ? { animation: 'ar-bot-shoot 0.5s ease-out' }
          : isLowHp      ? { animation: 'ar-wounded 0.75s ease-in-out infinite', filter: 'brightness(0.7) saturate(0.5)' }
          : isRusher     ? { animation: 'ar-rusher 0.55s ease-in-out infinite',  filter: 'hue-rotate(330deg) saturate(1.5)' }
          : isCrew       ? { animation: 'ar-crew 1.9s ease-in-out infinite' }
          : isDefender   ? { animation: 'ar-guard 2.2s ease-in-out infinite' }
          : {}
          : {}

        const spriteStyle = isNpc ? npcSpriteStyle : botSpriteStyle

        // ── ボット: 役割アイコン・ラベル ────────────────────────────────────
        const botRoleIcon  = isCrew ? '🛡️' : isRusher ? '⚡' : isDefender ? '🔒' : null
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

              {/* ── NPC: ロックオン脈動リング ────────────────────────────────── */}
              {isNpc && npcIsLockedOn && !npcIsStunned && (
                <div
                  className="absolute rounded-full border-[3px] border-red-500"
                  style={{ inset: '-12px', animation: 'ar-lockon-ring 0.7s ease-in-out infinite' }}
                />
              )}

              {/* ── ボット: ラッシャー突入リング（射程内） ─────────────────── */}
              {!isNpc && isRusher && entity.inRange && (
                <div
                  className="absolute rounded-full border-2 border-orange-400"
                  style={{ inset: '-10px', animation: 'ar-rush-ring 0.6s ease-in-out infinite' }}
                />
              )}

              {/* ── ボット: クルー 手を振るアイコン ─────────────────────────── */}
              {!isNpc && isCrew && (
                <span
                  className="absolute -top-5 text-lg"
                  style={{ animation: 'ar-crew-wave 1.5s ease-in-out infinite' }}
                >
                  👋
                </span>
              )}

              {/*
                ─── スプライト ────────────────────────────────────────────────
                絵文字を以下のいずれかに差し替えるだけで対応可能:

                【静止画 NPC】
                  <img src="/images/npc.png" className="w-16 h-24 object-contain" alt="" style={spriteStyle} />

                【静止画ボット（行動別）】
                  <img src={`/images/bot-${entity.behavior ?? 'roamer'}.png`} className="w-14 h-20 object-contain" alt="" style={spriteStyle} />

                【3D モデル（@react-three/fiber）】
                  <Canvas style={{ width: 80, height: 120, ...spriteStyle }}>
                    <Suspense fallback={null}><NPCModel /></Suspense>
                  </Canvas>
                ──────────────────────────────────────────────────────────────
              */}
              <span
                style={{ fontSize: isNpc ? '64px' : '48px', lineHeight: 1, ...spriteStyle }}
                className="drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)]"
              >
                {isNpc ? '👹' : '🤖'}
              </span>

              {/* NPC: スタン星 */}
              {isNpc && npcIsStunned && (
                <span className="absolute -top-4 text-xl" style={{ animation: 'ar-confused 1.2s ease-in-out infinite' }}>
                  ⭐
                </span>
              )}

              {/* ボット: 射撃フラッシュ */}
              {!isNpc && isRecentShot && (
                <span className="absolute -top-3 -right-3 text-base">💥</span>
              )}

              {/* ボット: 役割アイコン */}
              {!isNpc && botRoleIcon && (
                <span className="absolute -top-4 -right-4 text-base">{botRoleIcon}</span>
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
              <p
                className="text-[11px] font-bold mt-0.5 drop-shadow-[0_1px_4px_rgba(0,0,0,1)]"
                style={{ color: isNpc ? 'white' : botRoleColor }}
              >
                {entity.distM.toFixed(0)}m{entity.name ? ` · ${entity.name}` : ''}
              </p>

              {/* NPC: 状態ラベル */}
              {isNpc && (npcIsStunned || npcIsConfused || npcIsLunging) && (
                <span className={[
                  'text-[10px] font-black mt-0.5 drop-shadow-[0_1px_3px_rgba(0,0,0,1)]',
                  npcIsStunned  ? 'text-yellow-300' :
                  npcIsLunging  ? 'text-red-400 animate-pulse' :
                                  'text-blue-300',
                ].join(' ')}>
                  {npcIsStunned ? 'STUN' : npcIsLunging ? '！突進！' : '混乱中'}
                </span>
              )}

              {/* ボット: 状態ラベル */}
              {!isNpc && (
                <span
                  className="text-[9px] font-black mt-0.5 drop-shadow-[0_1px_3px_rgba(0,0,0,1)]"
                  style={{ color: botRoleColor }}
                >
                  {isLowHp      ? '！' :
                   isRecentShot ? '攻撃中' :
                   isCrew       ? 'ALLY' :
                   isRusher     ? 'RUSH' :
                   isDefender   ? 'GUARD' :
                                  ''}
                </span>
              )}

              {/* ボット: タップ攻撃誘導 */}
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
