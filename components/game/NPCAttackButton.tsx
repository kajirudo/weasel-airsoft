'use client'

/**
 * NPCAttackButton — 背後攻撃ボタン。
 * isBehind && canAttack のときのみ表示。
 * cooldownLeft > 0 のときはクールダウン表示。
 */

import { useState } from 'react'

interface Props {
  canAttack:    boolean
  isBehind:     boolean
  cooldownLeft: number    // 残秒（0 = 攻撃可能）
  isStunned:    boolean   // NPC スタン中は視覚的に示す
  npcHp:        number
  npcMaxHp:     number
  onAttack:     () => Promise<void>
}

export function NPCAttackButton({
  canAttack, isBehind, cooldownLeft, isStunned, npcHp, npcMaxHp, onAttack,
}: Props) {
  const [loading, setLoading] = useState(false)

  // 背後にもいない + クールダウン中でもない → 非表示
  if (!isBehind && cooldownLeft === 0) return null

  const handlePress = async () => {
    if (!canAttack || loading) return
    setLoading(true)
    try { await onAttack() } catch { /* ignore */ }
    setLoading(false)
  }

  const hitsLeft = Math.ceil(npcHp / 50)

  return (
    <div className="fixed bottom-32 left-4 z-[70] flex flex-col items-start gap-1.5">
      {/* ステータスヒント */}
      <p className="text-white/60 text-xs font-mono leading-tight">
        {isStunned
          ? '⚡ スタン中 — 全員で攻撃！'
          : isBehind
          ? '⚔️ 背後に立った！'
          : '…背後を取れ'}
      </p>
      {npcHp > 0 && (
        <p className="text-gray-400 text-[10px]">あと {hitsLeft}発</p>
      )}

      {/* 攻撃ボタン */}
      <button
        onPointerDown={handlePress}
        disabled={!canAttack || loading}
        className={[
          'relative w-16 h-16 rounded-full font-bold text-white shadow-xl',
          'flex flex-col items-center justify-center overflow-hidden',
          'active:scale-90 transition-transform',
          canAttack
            ? 'bg-purple-600 border-2 border-purple-400'
            : 'bg-gray-700 opacity-50 border border-gray-600',
        ].join(' ')}
      >
        {/* クールダウン進捗オーバーレイ */}
        {cooldownLeft > 0 && (
          <div
            className="absolute inset-0 bg-black/60 rounded-full"
            style={{ clipPath: `inset(${((30 - cooldownLeft) / 30) * 100}% 0 0 0)` }}
          />
        )}
        <span className="relative text-2xl leading-none">⚔️</span>
        <span className="relative text-[9px] leading-tight font-black">
          {cooldownLeft > 0 ? `${cooldownLeft}s` : '攻撃'}
        </span>
      </button>
    </div>
  )
}
