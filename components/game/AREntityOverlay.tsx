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
import type { GeoPosition }     from '@/hooks/useRadar'
import { geoDistM, bearingDeg } from '@/lib/game/geo'

/** カメラ水平視野角（度）— デバイスに合わせて調整可 */
const CAMERA_FOV_DEG = 60
/** この距離を超えたエンティティは非表示 */
const MAX_VISIBLE_M  = 80

interface AREntity {
  id:       string
  hp:       number
  maxHp:    number
  distM:    number
  relAngle: number   // コンパス方位との差 -180〜+180
  type:     'npc' | 'bot'
  name?:    string
  inRange:  boolean  // ボット攻撃射程内か
}

interface Props {
  geoPos:        GeoPosition
  /** ハンティングモード NPC */
  npc?:          GameNpc | null
  npcIsLunging?: boolean
  /** ソロプレイ ボット一覧 */
  bots?:         Player[]
  /** ボット攻撃射程（m） */
  botRangeM?:    number
  /** ボットスプライトをタップしたときのコールバック */
  onBotTap?:     (botId: string) => void
  /** ボット攻撃クールダウン中は true */
  botDisabled?:  boolean
}

export function AREntityOverlay({
  geoPos,
  npc,
  npcIsLunging = false,
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
        inRange: distM <= botRangeM,
      })
    }

    return result
  }, [geoPos, npc, bots, botRangeM])

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {entities.map(entity => {
        if (Math.abs(entity.relAngle) > halfFov) return null

        const xPct   = 50 + (entity.relAngle / halfFov) * 50
        const scale  = Math.max(0.35, 1.6 - (entity.distM / MAX_VISIBLE_M) * 1.2)
        const hpPct  = (entity.hp / entity.maxHp) * 100
        const canTap = entity.type === 'bot' && entity.inRange && !botDisabled
        const dimmed = entity.type === 'bot' && !entity.inRange

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
              transition:    'opacity 0.3s',
            }}
            onPointerDown={canTap ? () => onBotTap?.(entity.id) : undefined}
          >
            {/*
              ─── スプライト ──────────────────────────────────────────────────
              絵文字を以下のいずれかに差し替えるだけで対応可能:

              【静止画】
                <img
                  src="/images/npc.png"
                  className="w-16 h-24 object-contain drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]"
                  alt=""
                />

              【3D モデル（例: @react-three/fiber）】
                <Canvas style={{ width: 80, height: 120 }}>
                  <Suspense fallback={null}>
                    <NPCModel />
                  </Suspense>
                </Canvas>
              ────────────────────────────────────────────────────────────────
            */}
            <div className="flex flex-col items-center select-none">
              <span
                style={{ fontSize: entity.type === 'npc' ? '64px' : '48px', lineHeight: 1 }}
                className={[
                  'drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)]',
                  npcIsLunging && entity.type === 'npc' ? 'animate-pulse' : '',
                ].join(' ')}
              >
                {entity.type === 'npc' ? '👹' : '🤖'}
              </span>

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

              {/* 距離ラベル */}
              <p className="text-white text-[11px] font-bold mt-0.5 drop-shadow-[0_1px_4px_rgba(0,0,0,1)]">
                {entity.distM.toFixed(0)}m{entity.name ? ` · ${entity.name}` : ''}
              </p>

              {/* ボット射程内: タップ誘導 */}
              {entity.type === 'bot' && entity.inRange && !botDisabled && (
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
