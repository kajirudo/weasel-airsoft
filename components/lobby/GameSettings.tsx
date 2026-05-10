'use client'

interface GameSettingsProps {
  hitDamage:       number
  shootCooldown:   number
  durationMinutes: number
  onChange: (settings: {
    hitDamage:       number
    shootCooldown:   number
    durationMinutes: number
  }) => void
}

function SliderField({
  label, value, min, max, step, unit, displayValue, onChange,
}: {
  label:        string
  value:        number
  min:          number
  max:          number
  step:         number
  unit:         string
  displayValue?: string
  onChange:     (v: number) => void
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-400">{label}</span>
        <span className="text-green-400 font-mono font-bold">
          {displayValue ?? `${value}${unit}`}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-green-500"
      />
      <div className="flex justify-between text-xs text-gray-600">
        <span>{min === 0 ? '無制限' : `${min}${unit}`}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  )
}

export function GameSettings({
  hitDamage, shootCooldown, durationMinutes, onChange,
}: GameSettingsProps) {
  return (
    <div className="w-full bg-black/70 rounded-xl px-4 py-3 backdrop-blur-sm space-y-4">
      <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">
        ゲーム設定（ホスト）
      </p>

      <SliderField
        label="1ヒットダメージ"
        value={hitDamage}
        min={5} max={100} step={5} unit=""
        onChange={(v) => onChange({ hitDamage: v, shootCooldown, durationMinutes })}
      />

      <SliderField
        label="射撃クールダウン"
        value={shootCooldown}
        min={200} max={3000} step={100} unit="ms"
        onChange={(v) => onChange({ hitDamage, shootCooldown: v, durationMinutes })}
      />

      <SliderField
        label="制限時間"
        value={durationMinutes}
        min={0} max={30} step={5} unit="分"
        displayValue={durationMinutes === 0 ? '無制限' : `${durationMinutes}分`}
        onChange={(v) => onChange({ hitDamage, shootCooldown, durationMinutes: v })}
      />

      <div className="text-gray-600 text-xs space-y-0.5">
        <p>倒すのに必要な弾数: {hitDamage > 0 ? Math.ceil(100 / hitDamage) : '∞'}発</p>
        {durationMinutes > 0 && (
          <p>時間切れは残HP最大のプレイヤーが勝利（同率は引き分け）</p>
        )}
      </div>
    </div>
  )
}
