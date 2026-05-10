'use client'

import { useState, useEffect } from 'react'
import { MAX_HP, HIT_DAMAGE } from '@/lib/game/constants'

const STORAGE_KEY = 'weasel_tutorial_seen'

const STEPS = [
  {
    emoji: '📱',
    title: 'カメラをかざす',
    body: [
      '相手プレイヤーが身につけている',
      'QRコードにカメラを向けよう。',
      'スマートフォンを銃のように構えて。',
    ],
    tip: '背面カメラを使います',
  },
  {
    emoji: '🎯',
    title: 'レティクルに合わせる',
    body: [
      '画面中央の照準（レティクル）に',
      'QRコードを捉えると認識される。',
      '緑に光ったら射撃の準備OK！',
    ],
    tip: 'QRコードを正面から捉えると精度UP',
  },
  {
    emoji: '🔫',
    title: 'タップで射撃',
    body: [
      '画面をタップして撃とう。',
      '「AUTO」モードなら 0.5秒 保持で',
      '自動射撃されるから両手が自由に。',
    ],
    tip: 'Bluetoothトリガーにも対応',
  },
  {
    emoji: '❤️',
    title: `HP と勝利条件`,
    body: [
      `全員 HP ${MAX_HP} からスタート。`,
      `撃たれるたびに HP が ${HIT_DAMAGE} 減り、`,
      '0 になったら脱落。最後の1人が勝者！',
    ],
    tip: 'チームモードは赤・青チームの対戦',
  },
] as const

export function TutorialOverlay() {
  const [visible, setVisible] = useState(false)
  const [step,    setStep]    = useState(0)

  // localStorage を確認（SSR 回避のため useEffect 内）
  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) setVisible(true)
  }, [])

  function close() {
    localStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
  }

  function next() {
    if (step < STEPS.length - 1) setStep((s) => s + 1)
    else close()
  }

  function prev() {
    setStep((s) => Math.max(0, s - 1))
  }

  if (!visible) return null

  const current = STEPS[step]
  const isLast  = step === STEPS.length - 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
      <div className="w-full max-w-sm bg-gray-900 border border-gray-700 rounded-2xl overflow-hidden shadow-2xl">

        {/* ── プログレスバー ── */}
        <div className="flex h-1">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className="flex-1 transition-colors duration-300"
              style={{ backgroundColor: i <= step ? '#22c55e' : '#374151' }}
            />
          ))}
        </div>

        {/* ── 本文 ── */}
        <div className="px-6 pt-8 pb-6 text-center">
          {/* アイコン */}
          <div className="text-6xl mb-4 select-none">{current.emoji}</div>

          {/* タイトル */}
          <h2 className="text-white font-black text-2xl mb-3">{current.title}</h2>

          {/* 説明文 */}
          <div className="text-gray-300 text-sm leading-relaxed space-y-0.5 mb-4">
            {current.body.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>

          {/* ヒント */}
          <div className="inline-flex items-center gap-1.5 bg-gray-800 rounded-full px-3 py-1">
            <span className="text-green-400 text-xs">💡</span>
            <span className="text-green-400 text-xs font-medium">{current.tip}</span>
          </div>
        </div>

        {/* ── ナビゲーション ── */}
        <div className="px-6 pb-6 flex items-center gap-3">
          {/* 戻るボタン（最初のステップでは非表示） */}
          {step > 0 ? (
            <button
              onClick={prev}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-800 hover:bg-gray-700 text-gray-400 transition-colors"
            >
              ←
            </button>
          ) : (
            <div className="w-10" />
          )}

          {/* 次へ / はじめる */}
          <button
            onClick={next}
            className="flex-1 bg-green-600 hover:bg-green-500 active:scale-95 text-white font-bold py-3 rounded-xl transition-all"
          >
            {isLast ? 'ゲームをはじめる 🎮' : '次へ →'}
          </button>
        </div>

        {/* ── スキップ ── */}
        <div className="pb-4 text-center">
          <button
            onClick={close}
            className="text-gray-600 hover:text-gray-400 text-xs transition-colors"
          >
            スキップ
          </button>
        </div>
      </div>
    </div>
  )
}
