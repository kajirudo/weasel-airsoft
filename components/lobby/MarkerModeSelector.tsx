'use client'

import { useState, useEffect } from 'react'
import { MARKER_MODE_KEY, DEFAULT_MARKER_MODE } from '@/lib/game/constants'
import type { MarkerMode } from '@/lib/game/constants'

const MODES: Array<{
  value:    MarkerMode
  label:    string
  icon:     string
  range:    string
  desc:     string
  printUrl: string
}> = [
  {
    value:    'qr',
    label:    'QRコード',
    icon:     '▦',
    range:    '〜5m',
    desc:     '印刷・スマホ対応。室内近接戦向け',
    printUrl: '/qr',
  },
  {
    value:    'aruco',
    label:    'ArUco',
    icon:     '◈',
    range:    '〜12m',
    desc:     '屋外サバゲー向け。スナイパー戦が成立',
    printUrl: '/aruco',
  },
]

export function MarkerModeSelector() {
  const [mode, setMode] = useState<MarkerMode>(DEFAULT_MARKER_MODE)

  // localStorage から初期値を読み込む（SSR 回避のため useEffect 内）
  useEffect(() => {
    const stored = localStorage.getItem(MARKER_MODE_KEY)
    if (stored === 'aruco' || stored === 'qr') setMode(stored)
  }, [])

  function handleChange(next: MarkerMode) {
    setMode(next)
    localStorage.setItem(MARKER_MODE_KEY, next)
  }

  return (
    <div className="w-full">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">
        マーカーモード
      </p>

      <div className="flex gap-2">
        {MODES.map((m) => {
          const isActive = mode === m.value
          return (
            <button
              key={m.value}
              onClick={() => handleChange(m.value)}
              className={[
                'flex-1 rounded-xl border px-3 py-2.5 text-left transition-all',
                isActive
                  ? 'bg-green-600/20 border-green-500 text-white'
                  : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500',
              ].join(' ')}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="flex items-center gap-1.5 font-bold text-sm">
                  <span className="font-mono text-lg leading-none">{m.icon}</span>
                  {m.label}
                </span>
                <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                  isActive ? 'bg-green-500/30 text-green-300' : 'bg-gray-800 text-gray-500'
                }`}>
                  {m.range}
                </span>
              </div>
              <p className="text-xs text-gray-500 leading-tight">{m.desc}</p>
            </button>
          )
        })}
      </div>

      {/* 選択中モードの印刷ページへのリンク */}
      <div className="mt-2 text-right">
        {MODES.filter((m) => m.value === mode).map((m) => (
          <a
            key={m.value}
            href={m.printUrl}
            className="text-xs text-gray-600 hover:text-gray-400 underline underline-offset-2 transition-colors"
            target="_blank"
            rel="noreferrer"
          >
            {m.label}マーカー印刷ページ →
          </a>
        ))}
      </div>
    </div>
  )
}
