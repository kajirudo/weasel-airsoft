'use client'

import { useState, useEffect } from 'react'

const LOCK_SECONDS   = 4
const STORAGE_KEY    = 'weasel_disclaimer_agreed_at'
const RESHOW_HOURS   = 72
const RESHOW_MS      = RESHOW_HOURS * 60 * 60 * 1000

function needsDisclaimer(): boolean {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return true
  const agreedAt = Number(raw)
  return isNaN(agreedAt) || Date.now() - agreedAt > RESHOW_MS
}

export function DisclaimerModal() {
  const [remaining, setRemaining] = useState(LOCK_SECONDS)
  const [agreed,    setAgreed]    = useState(false)
  const [checked,   setChecked]   = useState(false)

  // SSR 回避: マウント後に localStorage を確認
  useEffect(() => {
    if (!needsDisclaimer()) setAgreed(true)
  }, [])

  useEffect(() => {
    if (remaining <= 0) return
    const id = setInterval(() => setRemaining((r) => r - 1), 1000)
    return () => clearInterval(id)
  }, [remaining])

  if (agreed) return null

  const canAgree = remaining <= 0 && checked

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/90 backdrop-blur-sm px-4">
      <div className="w-full max-w-sm bg-gray-900 border border-amber-500/60 rounded-2xl overflow-hidden shadow-2xl">

        {/* ── ヘッダー ── */}
        <div className="bg-amber-500/15 px-5 pt-6 pb-4 text-center border-b border-amber-500/30">
          <div className="text-4xl mb-2 select-none">⚠️</div>
          <h2 className="text-amber-400 font-black text-lg leading-snug">
            【超重要】ご利用上の注意と免責事項
          </h2>
        </div>

        {/* ── 本文 ── */}
        <div className="px-5 py-4 space-y-4 text-sm">

          {/* 前置き */}
          <p className="text-gray-300 leading-relaxed">
            本システム（weasel&#8209;airsoft）は、屋内および周囲の安全が完全に確保された
            <span className="text-white font-bold">クローズドな私有地（サバゲーフィールド等）</span>での使用を前提とした、
            研究開発用のプロトタイプです。
          </p>

          {/* 禁止事項 */}
          <div className="bg-red-950/60 border border-red-700/50 rounded-xl p-4">
            <p className="text-red-400 font-black text-xs tracking-widest mb-2">🚫 禁止事項</p>
            <ul className="space-y-1.5 text-gray-200 text-sm">
              <li className="flex gap-2">
                <span className="text-red-400 shrink-0">•</span>
                公道・駅のホーム・商業施設、その他公共の場所でのプレイ
              </li>
              <li className="flex gap-2">
                <span className="text-red-400 shrink-0">•</span>
                歩きスマホ、および画面を注視しながらの移動
              </li>
              <li className="flex gap-2">
                <span className="text-red-400 shrink-0">•</span>
                人混みや第三者にスマホ（デバイス）を向ける行為
              </li>
            </ul>
          </div>

          {/* 免責事項 */}
          <div className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-4">
            <p className="text-gray-400 font-black text-xs tracking-widest mb-2">📋 免責事項</p>
            <p className="text-gray-400 text-xs leading-relaxed">
              本システムの利用に伴い発生した事故・怪我・第三者とのトラブル・建造物の破損
              または法令違反等について、開発者は直接・間接を問わず
              <span className="text-white font-bold">一切の責任を負いません</span>。
              ユーザーご自身の責任において、安全に配慮してご利用ください。
            </p>
          </div>

          {/* 上記内容を確認した旨 */}
          <p className="text-gray-500 text-xs text-center">
            「同意してプレイする」ボタンを押すことで、上記内容すべてを理解し同意したものとみなします。
          </p>
        </div>

        {/* ── チェックボックス ── */}
        <div className="px-5 pb-2">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 w-5 h-5 shrink-0 accent-green-500 cursor-pointer"
            />
            <span className="text-gray-300 text-sm leading-snug">
              禁止事項・免責事項を読み、すべて理解しました
            </span>
          </label>
        </div>

        {/* ── 同意ボタン ── */}
        <div className="px-5 pb-6 pt-3">
          <button
            onClick={() => {
              localStorage.setItem(STORAGE_KEY, String(Date.now()))
              setAgreed(true)
            }}
            disabled={!canAgree}
            className={[
              'w-full py-3.5 rounded-xl font-black text-base transition-all duration-300',
              canAgree
                ? 'bg-green-600 hover:bg-green-500 active:scale-95 text-white'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed',
            ].join(' ')}
          >
            {remaining > 0
              ? `内容を確認してください… ${remaining}`
              : canAgree
                ? '同意してプレイする ✅'
                : 'チェックボックスにチェックしてください'}
          </button>

          {/* 次回表示タイミングの案内 */}
          <p className="text-gray-600 text-xs text-center mt-2">
            同意は {RESHOW_HOURS} 時間有効です
          </p>
        </div>
      </div>
    </div>
  )
}
