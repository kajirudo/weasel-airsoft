'use client'

/**
 * NPCAlert — ロックオン中の被ロックオンエフェクト
 *
 * lockonProgress:
 *   0〜0.3 → 「視線を感じる」淡い枠
 *   0.3〜0.7 → 「見られている！」中程度
 *   0.7〜1.0 → 「食われる！」強烈
 */

interface Props {
  isBeingLockedOn: boolean
  lockonProgress:  number   // 0〜1
  distM:           number | null
  isLungeArming:   boolean
  lungeProgress:   number   // 0〜1
}

export function NPCAlert({ isBeingLockedOn, lockonProgress, distM, isLungeArming, lungeProgress }: Props) {
  // ランジ予告は別コンポーネント (NPCLungeWarning) で表示するが、
  // ここではランジ時に追加の赤フラッシュエフェクトのみ
  const showLunge  = isLungeArming
  const showLockon = isBeingLockedOn && !isLungeArming

  if (!showLockon && !showLunge) return null

  return (
    <div className="fixed inset-0 pointer-events-none z-[75]" aria-hidden="true">
      {/* ── ロックオンビネット ──────────────────────────────────────────── */}
      {showLockon && (
        <>
          {/* 外周から内側へ縮む赤い枠 */}
          <div
            className="absolute inset-0"
            style={{
              boxShadow: `inset 0 0 ${80 + lockonProgress * 200}px rgba(239,68,68,${0.35 + lockonProgress * 0.55})`,
              borderWidth: `${Math.max(2, (1 - lockonProgress) * 12)}px`,
              borderStyle: 'solid',
              borderColor: `rgba(239,68,68,${0.6 + lockonProgress * 0.4})`,
            }}
          />

          {/* 中央テキスト */}
          <div className="absolute top-[22%] left-0 right-0 text-center space-y-1.5">
            <p
              className="font-black text-4xl drop-shadow-lg animate-pulse"
              style={{ color: `rgb(${Math.round(239 + (255-239) * lockonProgress)},${Math.round(68 * (1 - lockonProgress))},68)` }}
            >
              {lockonProgress < 0.35
                ? '👁️ 視線を感じる…'
                : lockonProgress < 0.70
                ? '⚠️ 見られている！'
                : '🔥 食われる！！'}
            </p>
            {distM != null && (
              <p className="text-white/70 text-sm font-mono">{Math.round(distM)}m</p>
            )}
            <p className="text-white/60 text-xs mt-0.5">
              {lockonProgress < 0.5 ? '逃げろ！' : '背後から援護を！'}
            </p>
          </div>

          {/* 進捗バー（下部） */}
          <div className="absolute bottom-24 left-8 right-8 h-1 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-red-500 transition-all"
              style={{ width: `${lockonProgress * 100}%` }}
            />
          </div>
        </>
      )}

      {/* ── ランジ時の追加フラッシュ ──────────────────────────────────── */}
      {showLunge && (
        <div
          className="absolute inset-0"
          style={{
            backgroundColor: `rgba(239,68,68,${0.15 + lungeProgress * 0.35})`,
          }}
        />
      )}
    </div>
  )
}
