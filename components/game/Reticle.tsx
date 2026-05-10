'use client'

import { useState, useEffect } from 'react'

interface ReticleProps {
  active:   boolean
  /** 通信切断中 → アンバー表示 */
  offline?: boolean
  /** 現在のズーム倍率（1 より大きい場合はスナイパースコープ表示） */
  zoom?: number
}

export function Reticle({ active, offline = false, zoom = 1 }: ReticleProps) {
  // 優先度: offline > active > default
  const color = offline
    ? 'rgba(251, 191, 36, 0.85)'
    : active
    ? '#22c55e'
    : 'rgba(255,255,255,0.7)'

  // ── 実ピクセル寸法（SVG 内で円が歪まないよう viewBox 非依存で計算）
  const [dims, setDims] = useState({ w: 390, h: 844 })
  useEffect(() => {
    function update() {
      setDims({ w: window.innerWidth, h: window.innerHeight })
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // ── ズーム中 → スナイパースコープ
  if (zoom > 1) {
    const { w, h } = dims
    const cx      = w / 2
    const cy      = h / 2
    const outerR  = Math.min(w, h) * 0.38       // スコープ外径
    const innerR  = outerR * 0.42               // 内側リング
    // ズームが高いほどビネット強め（2× → 0.5、4× → 0.65）
    const vigOpacity = Math.min(0.35 + (zoom - 1) * 0.12, 0.72)

    // ミルドット位置（スコープ半径の 0.3 / 0.6 / 0.85 倍）
    const milDots = [outerR * 0.30, outerR * 0.58, outerR * 0.84]

    return (
      <div className="absolute inset-0 pointer-events-none">
        <svg
          width={w}
          height={h}
          style={{ position: 'absolute', top: 0, left: 0 }}
          // overflow: visible にしないと clipPath 外が見切れる
          overflow="visible"
        >
          <defs>
            {/* スコープ外を暗くするマスク（白=不透明、黒=透明の穴） */}
            <mask id="reticle-scope-mask">
              <rect width={w} height={h} fill="white" />
              <circle cx={cx} cy={cy} r={outerR} fill="black" />
            </mask>

            {/* スコープ内ビネット（中心→外縁に向かって暗くなる放射グラデ） */}
            <radialGradient
              id="reticle-vignette"
              cx={cx} cy={cy} r={outerR}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="45%" stopColor="black" stopOpacity="0" />
              <stop offset="100%" stopColor="black" stopOpacity={vigOpacity} />
            </radialGradient>

            {/* スコープ円のクリップ（クロスヘアをスコープ内に限定） */}
            <clipPath id="reticle-scope-clip">
              <circle cx={cx} cy={cy} r={outerR - 1} />
            </clipPath>
          </defs>

          {/* ①スコープ外を暗くする */}
          <rect
            x={0} y={0} width={w} height={h}
            fill="black" fillOpacity={0.78}
            mask="url(#reticle-scope-mask)"
          />

          {/* ②スコープ内ビネット */}
          <rect
            x={0} y={0} width={w} height={h}
            fill="url(#reticle-vignette)"
            clipPath="url(#reticle-scope-clip)"
          />

          {/* ③スコープリング */}
          <circle cx={cx} cy={cy} r={outerR} stroke={color} strokeWidth="2" fill="none" opacity="0.92" />

          {/* ④内リング */}
          <circle cx={cx} cy={cy} r={innerR} stroke={color} strokeWidth="1" fill="none" opacity="0.45" />

          {/* ⑤クロスヘア（スコープ内の端から端、内リングで途切れる） */}
          {/* 上 */}
          <line
            x1={cx} y1={cy - outerR + 2}
            x2={cx} y2={cy - innerR * 0.25}
            stroke={color} strokeWidth="1" opacity="0.85"
            clipPath="url(#reticle-scope-clip)"
          />
          {/* 下 */}
          <line
            x1={cx} y1={cy + innerR * 0.25}
            x2={cx} y2={cy + outerR - 2}
            stroke={color} strokeWidth="1" opacity="0.85"
            clipPath="url(#reticle-scope-clip)"
          />
          {/* 左 */}
          <line
            x1={cx - outerR + 2} y1={cy}
            x2={cx - innerR * 0.25} y2={cy}
            stroke={color} strokeWidth="1" opacity="0.85"
            clipPath="url(#reticle-scope-clip)"
          />
          {/* 右 */}
          <line
            x1={cx + innerR * 0.25} y1={cy}
            x2={cx + outerR - 2} y2={cy}
            stroke={color} strokeWidth="1" opacity="0.85"
            clipPath="url(#reticle-scope-clip)"
          />

          {/* ⑥ミルドット（水平・垂直） */}
          {milDots.map((d, i) => (
            <g key={i}>
              <circle cx={cx + d} cy={cy}     r={2}   fill={color} opacity="0.8" />
              <circle cx={cx - d} cy={cy}     r={2}   fill={color} opacity="0.8" />
              <circle cx={cx}     cy={cy + d} r={2}   fill={color} opacity="0.8" />
              <circle cx={cx}     cy={cy - d} r={2}   fill={color} opacity="0.8" />
            </g>
          ))}

          {/* ⑦スコープリング上の目盛り（上下左右） */}
          {[0, 90, 180, 270].map((deg) => {
            const rad = (deg * Math.PI) / 180
            const x1  = cx + Math.cos(rad) * (outerR - 10)
            const y1  = cy + Math.sin(rad) * (outerR - 10)
            const x2  = cx + Math.cos(rad) * (outerR + 10)
            const y2  = cy + Math.sin(rad) * (outerR + 10)
            return (
              <line
                key={deg}
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={color} strokeWidth="2" strokeLinecap="round" opacity="0.7"
              />
            )
          })}

          {/* ⑧中心点 */}
          <circle cx={cx} cy={cy} r={2.5} fill={color} />

          {/* ⑨オフライン時: ×マーク */}
          {offline && (
            <>
              <line
                x1={cx - 18} y1={cy - 18} x2={cx + 18} y2={cy + 18}
                stroke={color} strokeWidth="2.5" strokeLinecap="round"
              />
              <line
                x1={cx + 18} y1={cy - 18} x2={cx - 18} y2={cy + 18}
                stroke={color} strokeWidth="2.5" strokeLinecap="round"
              />
            </>
          )}
        </svg>

        {offline && (
          <span
            style={{
              position:      'absolute',
              top:           `${dims.h / 2 + dims.h * 0.38 + 18}px`,
              left:          '50%',
              transform:     'translateX(-50%)',
              fontSize:      '10px',
              fontWeight:    700,
              color,
              letterSpacing: '0.1em',
            }}
          >
            OFFLINE
          </span>
        )}
      </div>
    )
  }

  // ── 通常レティクル（ズーム 1×）
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <svg width="120" height="120" viewBox="0 0 120 120">
        {/* 外円 */}
        <circle cx="60" cy="60" r="56" stroke={color} strokeWidth="1.5" fill="none" />

        {/* 中心点 */}
        <circle cx="60" cy="60" r="3" fill={color} />

        {/* 十字線 */}
        <line x1="60" y1="4"   x2="60" y2="44"  stroke={color} strokeWidth="1.5" />
        <line x1="60" y1="76"  x2="60" y2="116" stroke={color} strokeWidth="1.5" />
        <line x1="4"  y1="60"  x2="44" y2="60"  stroke={color} strokeWidth="1.5" />
        <line x1="76" y1="60"  x2="116" y2="60" stroke={color} strokeWidth="1.5" />

        {/* 隅の目盛り */}
        <path d="M20 10 L10 10 L10 20"     stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M100 10 L110 10 L110 20"  stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M20 110 L10 110 L10 100"  stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M100 110 L110 110 L110 100" stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" />

        {/* オフライン時: ×マーク */}
        {offline && (
          <>
            <line x1="48" y1="48" x2="72" y2="72" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
            <line x1="72" y1="48" x2="48" y2="72" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          </>
        )}
      </svg>

      {/* オフラインラベル */}
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
