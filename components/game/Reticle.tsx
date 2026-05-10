'use client'

interface ReticleProps {
  active: boolean
  /** true のとき通信切断中を示すアンバー表示にする */
  offline?: boolean
}

export function Reticle({ active, offline = false }: ReticleProps) {
  // 優先度: offline > active > default
  const color = offline
    ? 'rgba(251, 191, 36, 0.85)'   // amber-400 — オフライン
    : active
    ? '#22c55e'                     // green-500  — 照準内
    : 'rgba(255,255,255,0.7)'       // white      — 通常

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <svg width="120" height="120" viewBox="0 0 120 120">
        {/* 外円 */}
        <circle cx="60" cy="60" r="56" stroke={color} strokeWidth="1.5" fill="none" />

        {/* 中心点 */}
        <circle cx="60" cy="60" r="3" fill={color} />

        {/* 十字線 */}
        <line x1="60" y1="4"  x2="60" y2="44"  stroke={color} strokeWidth="1.5" />
        <line x1="60" y1="76" x2="60" y2="116" stroke={color} strokeWidth="1.5" />
        <line x1="4"  y1="60" x2="44" y2="60"  stroke={color} strokeWidth="1.5" />
        <line x1="76" y1="60" x2="116" y2="60" stroke={color} strokeWidth="1.5" />

        {/* 隅の目盛り */}
        <path d="M20 10 L10 10 L10 20" stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M100 10 L110 10 L110 20" stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M20 110 L10 110 L10 100" stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M100 110 L110 110 L110 100" stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" />

        {/* オフライン時: 中央に×マーク（射撃不可を視覚的に示す） */}
        {offline && (
          <>
            <line x1="48" y1="48" x2="72" y2="72" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
            <line x1="72" y1="48" x2="48" y2="72" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          </>
        )}
      </svg>

      {/* オフライン時のラベル */}
      {offline && (
        <span
          className="absolute"
          style={{ top: 'calc(50% + 68px)', fontSize: '10px', fontWeight: 700, color, letterSpacing: '0.1em' }}
        >
          OFFLINE
        </span>
      )}
    </div>
  )
}
