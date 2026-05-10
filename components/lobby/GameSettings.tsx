'use client'

interface GameSettingsProps {
  hitDamage: number
  shootCooldown: number
  onChange: (settings: { hitDamage: number; shootCooldown: number }) => void
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  onChange: (v: number) => void
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-400">{label}</span>
        <span className="text-green-400 font-mono font-bold">
          {value}
          {unit}
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
        <span>{min}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  )
}

export function GameSettings({ hitDamage, shootCooldown, onChange }: GameSettingsProps) {
  return (
    <div className="w-full bg-black/70 rounded-xl px-4 py-3 backdrop-blur-sm space-y-4">
      <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">
        ゲーム設定（ホスト）
      </p>

      <SliderField
        label="1ヒットダメージ"
        value={hitDamage}
        min={5}
        max={100}
        step={5}
        unit=""
        onChange={(v) => onChange({ hitDamage: v, shootCooldown })}
      />

      <SliderField
        label="射撃クールダウン"
        value={shootCooldown}
        min={200}
        max={3000}
        step={100}
        unit="ms"
        onChange={(v) => onChange({ hitDamage, shootCooldown: v })}
      />

      <p className="text-gray-600 text-xs">
        ※ 倒すのに必要な弾数: {hitDamage > 0 ? Math.ceil(100 / hitDamage) : '∞'}発
      </p>
    </div>
  )
}
