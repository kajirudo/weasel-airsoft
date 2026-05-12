'use client'

import type { MarkerMode } from '@/lib/game/constants'

interface GameSettingsValues {
  hitDamage:       number
  shootCooldown:   number
  durationMinutes: number
  teamMode:        boolean
  markerMode:      MarkerMode
}

interface GameSettingsProps extends GameSettingsValues {
  onChange: (settings: GameSettingsValues) => void
}

function SliderField({
  label, value, min, max, step, displayValue, onChange,
}: {
  label:         string
  value:         number
  min:           number
  max:           number
  step:          number
  displayValue?: string
  onChange:      (v: number) => void
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-400">{label}</span>
        <span className="text-green-400 font-mono font-bold">{displayValue ?? value}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-green-500"
      />
      <div className="flex justify-between text-xs text-gray-600">
        <span>{min === 0 ? '無制限' : min}</span>
        <span>{max}</span>
      </div>
    </div>
  )
}

export function GameSettings({
  hitDamage, shootCooldown, durationMinutes, teamMode, markerMode, onChange,
}: GameSettingsProps) {
  const set = (partial: Partial<GameSettingsValues>) =>
    onChange({ hitDamage, shootCooldown, durationMinutes, teamMode, markerMode, ...partial })

  return (
    <div className="w-full bg-black/70 rounded-xl px-4 py-3 backdrop-blur-sm space-y-4">
      <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">ゲーム設定（ホスト）</p>

      <SliderField
        label="1ヒットダメージ" value={hitDamage} min={5} max={100} step={5}
        onChange={(v) => set({ hitDamage: v })}
      />
      <SliderField
        label="射撃クールダウン" value={shootCooldown} min={200} max={3000} step={100}
        displayValue={`${shootCooldown}ms`}
        onChange={(v) => set({ shootCooldown: v })}
      />
      <SliderField
        label="制限時間" value={durationMinutes} min={0} max={30} step={5}
        displayValue={durationMinutes === 0 ? '無制限' : `${durationMinutes}分`}
        onChange={(v) => set({ durationMinutes: v })}
      />

      {/* マーカーモード */}
      <div>
        <p className="text-gray-400 text-xs mb-2">マーカーモード</p>
        <div className="flex gap-2">
          {(['qr', 'aruco'] as MarkerMode[]).map((m) => (
            <button
              key={m}
              onClick={() => set({ markerMode: m })}
              className={[
                'flex-1 py-2 rounded-lg text-xs font-bold border transition-all',
                markerMode === m
                  ? 'bg-green-600/30 border-green-500 text-green-300'
                  : 'bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-500',
              ].join(' ')}
            >
              {m === 'qr' ? '▦ QR（〜5m）' : '◈ ArUco（〜12m）'}
            </button>
          ))}
        </div>
        <p className="text-gray-600 text-xs mt-1.5">
          {markerMode === 'qr'
            ? '室内・近接戦向け。QRマーカーを印刷して装着。'
            : '屋外サバゲー向け。ArUcoマーカーを印刷して装着。'}
        </p>
      </div>

      {/* チームモード */}
      <label className="flex items-center justify-between cursor-pointer select-none">
        <div>
          <span className="text-gray-400 text-xs">チームモード</span>
          {teamMode && (
            <p className="text-gray-600 text-xs mt-0.5">
              🔴 P1・P3・P5 ／ 🔵 P2・P4・P6
            </p>
          )}
        </div>
        <div
          onClick={() => set({ teamMode: !teamMode })}
          className={`w-10 h-6 rounded-full transition-colors relative ${teamMode ? 'bg-green-600' : 'bg-gray-700'}`}
        >
          <span
            className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${teamMode ? 'left-5' : 'left-1'}`}
          />
        </div>
      </label>

      <div className="text-gray-600 text-xs space-y-0.5">
        <p>倒すのに必要な弾数: {hitDamage > 0 ? Math.ceil(100 / hitDamage) : '∞'}発</p>
        {durationMinutes > 0 && !teamMode && <p>時間切れ → 最高 HP のプレイヤーが勝利</p>}
        {durationMinutes > 0 &&  teamMode && <p>時間切れ → 合計 HP が多いチームが勝利</p>}
      </div>
    </div>
  )
}
