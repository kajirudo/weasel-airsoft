'use client'

/**
 * ShootingTargetOverlay — タップ式 AR シューターの的オーバーレイ
 *
 *   bearing_deg = X% (0..100)
 *   dist_m      = Y% (0..100)
 *   drift_dps   = X方向ドリフト (%/sec)
 *
 * 各ターゲットは pointer-events-auto なボタンで、タップすると onHit が発火する。
 * 寿命切れに近づくと点滅、HP残量バー (tough のみ)、kind 別の見た目を持つ。
 */

import { useEffect, useRef, useState } from 'react'
import type { ShootingTarget } from '@/types/database'
import { SHOOTING_TARGET_KINDS, shootingEnvConfig } from '@/lib/game/constants'
import type { ShootingEnvironment } from '@/types/database'

interface Props {
  targets:     ShootingTarget[]
  environment: ShootingEnvironment
  now:         number
  /** ターゲットがタップされたときに発火（id 渡す） */
  onHit:       (target: ShootingTarget) => void
  /** リロード中・弾切れ等で操作不能なときは true（タップ無視 + 半透明化） */
  locked?:     boolean
}

interface DyingMark {
  id:        string
  startedAt: number
  x:         number
  y:         number
  color:     string
  emoji:     string
}

const DYING_MS = 400

export function ShootingTargetOverlay({
  targets, environment, now, onHit, locked = false,
}: Props) {
  const cfg = shootingEnvConfig(environment)

  // 撃破された的を短時間アニメ表示するための「死にゆく的」リスト
  const [dying, setDying] = useState<DyingMark[]>([])
  const seenAliveRef = useRef<Map<string, DyingMark>>(new Map())

  useEffect(() => {
    const aliveIds = new Set(targets.filter(t => !t.killed_at).map(t => t.id))
    const nowMs    = Date.now()
    const justDied: DyingMark[] = []
    for (const [id, mark] of seenAliveRef.current.entries()) {
      if (!aliveIds.has(id)) {
        justDied.push({ ...mark, startedAt: nowMs })
        seenAliveRef.current.delete(id)
      }
    }
    for (const t of targets) {
      if (t.killed_at) continue
      if (!seenAliveRef.current.has(t.id)) {
        const c = SHOOTING_TARGET_KINDS[t.kind]
        const elapsed = (nowMs - new Date(t.spawn_at).getTime()) / 1000
        const x = t.bearing_deg + t.drift_dps * elapsed
        seenAliveRef.current.set(t.id, {
          id: t.id, startedAt: 0,
          x: ((x % 100) + 100) % 100, y: t.dist_m,
          color: c.color, emoji: c.emoji,
        })
      }
    }
    if (justDied.length === 0) return
    // setTimeout 経由で同期 setState in effect を回避
    const addId = setTimeout(() => setDying(prev => [...prev, ...justDied]), 0)
    const removeId = setTimeout(() => {
      setDying(prev => prev.filter(p =>
        !justDied.some(d => d.id === p.id && d.startedAt === p.startedAt)
      ))
    }, DYING_MS + 100)
    return () => { clearTimeout(addId); clearTimeout(removeId) }
  }, [targets])

  const visibleDying = dying

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      {targets.map(t => {
        if (t.killed_at) return null
        const spawnAt   = new Date(t.spawn_at).getTime()
        const expiresAt = new Date(t.expires_at).getTime()
        if (expiresAt <= now) return null

        const elapsed   = (now - spawnAt) / 1000
        // ドリフト適用 (runner/bonus 用)。 % 単位なので 100 で wrap
        const rawX      = t.bearing_deg + t.drift_dps * elapsed
        const xPct      = ((rawX % 100) + 100) % 100
        const yPct      = t.dist_m

        const c         = SHOOTING_TARGET_KINDS[t.kind]
        const totalLife = Math.max(1, expiresAt - spawnAt)
        const lifePct   = Math.max(0, (expiresAt - now) / totalLife)
        const urgent    = lifePct < 0.25   // 残り 25% で警告点滅

        // サイズ: 環境ベース × kind ごとの sizeMul
        const sizeVw    = cfg.targetBaseSize * t.size_factor
        const spawnAge  = now - spawnAt
        const popPct    = Math.min(1, spawnAge / 250)   // 出現アニメ (0->1)

        return (
          <button
            key={t.id}
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation()
              if (locked) return
              onHit(t)
            }}
            disabled={locked}
            className="absolute select-none"
            style={{
              left:           `${xPct}%`,
              top:            `${yPct}%`,
              width:          `${sizeVw}vw`,
              height:         `${sizeVw}vw`,
              maxWidth:       '180px',
              maxHeight:      '180px',
              transform:      `translate(-50%, -50%) scale(${popPct})`,
              transformOrigin: 'center',
              transition:     'transform 0.18s cubic-bezier(0.2, 1.3, 0.4, 1)',
              opacity:        locked ? 0.45 : 1,
              pointerEvents:  locked ? 'none' : 'auto',
              background:     'transparent',
              border:         'none',
              padding:        0,
              cursor:         'pointer',
            }}
          >
            {/* 同心円アクセント */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: `radial-gradient(circle at center,
                  ${c.color}25 0%,
                  ${c.color}10 45%,
                  transparent 70%)`,
                animation: urgent ? 'shoot-pulse 0.45s ease-in-out infinite' : undefined,
              }}
            />
            <div
              className="absolute inset-[20%] rounded-full"
              style={{
                border: `2px solid ${c.color}aa`,
                boxShadow: `0 0 12px ${c.color}66, inset 0 0 8px ${c.color}55`,
              }}
            />
            {/* 中央スプライト */}
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ fontSize: `${sizeVw * 0.55}vw` }}
            >
              <span style={{
                filter: `drop-shadow(0 1px 4px rgba(0,0,0,0.9)) drop-shadow(0 0 8px ${c.color})`,
                lineHeight: 1,
              }}>
                {c.emoji}
              </span>
            </div>

            {/* tough は HP バー */}
            {t.kind === 'tough' && t.max_hp > 1 && (
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-2/3 h-1 bg-black/70 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-150"
                  style={{ width: `${(t.hp / t.max_hp) * 100}%`, background: c.color }}
                />
              </div>
            )}

            {/* スコア (bonus のみ目立たせる) */}
            {t.kind === 'bonus' && (
              <span
                className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] font-black tracking-widest whitespace-nowrap"
                style={{ color: c.color,
                  textShadow: '0 1px 4px rgba(0,0,0,1)' }}
              >
                +{t.base_score}
              </span>
            )}
          </button>
        )
      })}

      {/* 撃破エフェクト */}
      {visibleDying.map(d => (
        <div
          key={`${d.id}-${d.startedAt}`}
          className="absolute pointer-events-none"
          style={{
            left:      `${d.x}%`,
            top:       `${d.y}%`,
            transform: 'translate(-50%, -50%)',
            animation: `shoot-explode ${DYING_MS}ms ease-out forwards`,
          }}
        >
          <div
            className="rounded-full"
            style={{
              width: '60px', height: '60px',
              background: `radial-gradient(circle, ${d.color}cc 0%, ${d.color}66 30%, transparent 70%)`,
            }}
          />
          {/* 飛び散る emoji 風 */}
          {[...Array(6)].map((_, i) => (
            <span
              key={i}
              className="absolute left-1/2 top-1/2 text-xl"
              style={{
                animation: `shoot-shard ${DYING_MS}ms ease-out forwards`,
                animationDelay: '0ms',
                transform: `translate(-50%, -50%) rotate(${i * 60}deg)`,
                color: d.color,
                textShadow: '0 1px 3px rgba(0,0,0,1)',
                ['--shard-angle' as string]: `${i * 60}deg`,
              } as React.CSSProperties}
            >
              ✦
            </span>
          ))}
        </div>
      ))}

      <style>{`
        @keyframes shoot-pulse {
          0%, 100% { transform: scale(1);   opacity: 1;   }
          50%      { transform: scale(1.1); opacity: 0.7; }
        }
        @keyframes shoot-explode {
          0%   { transform: translate(-50%, -50%) scale(0.4); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1.8); opacity: 0; }
        }
        @keyframes shoot-shard {
          0%   { transform: translate(-50%, -50%) rotate(var(--shard-angle)) translateX(0)     scale(1);   opacity: 1; }
          100% { transform: translate(-50%, -50%) rotate(var(--shard-angle)) translateX(50px)  scale(0.3); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
