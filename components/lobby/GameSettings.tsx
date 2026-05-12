'use client'

import type { MarkerMode, GameMode } from '@/lib/game/constants'
import { GAME_MODE_LABELS } from '@/lib/game/constants'

export interface GameSettingsValues {
  hitDamage:       number
  shootCooldown:   number
  durationMinutes: number
  teamMode:        boolean
  markerMode:      MarkerMode
  gameMode:        GameMode
  stormRadiusM:    number   // 初期安全圏半径（バトルモード）
  stormFinalM:     number   // 最終安全圏半径（バトルモード）
  fieldRadiusM:    number   // オブジェクト散布半径
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
  hitDamage, shootCooldown, durationMinutes, teamMode, markerMode,
  gameMode, stormRadiusM, stormFinalM, fieldRadiusM,
  onChange,
}: GameSettingsProps) {
  const set = (partial: Partial<GameSettingsValues>) =>
    onChange({
      hitDamage, shootCooldown, durationMinutes, teamMode, markerMode,
      gameMode, stormRadiusM, stormFinalM, fieldRadiusM,
      ...partial,
    })

  function handleGameModeChange(mode: GameMode) {
    // タクティクスはチームモード強制オン
    const newTeamMode = mode === 'tactics' ? true : teamMode
    set({ gameMode: mode, teamMode: newTeamMode })
  }

  return (
    <div className="w-full bg-black/70 rounded-xl px-4 py-3 backdrop-blur-sm space-y-4">
      <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">ゲーム設定（ホスト）</p>

      {/* ── ゲームモード ─────────────────────────────────────────────────────── */}
      <div>
        <p className="text-gray-400 text-xs mb-2">ゲームモード</p>
        <div className="flex flex-col gap-1.5">
          {(Object.entries(GAME_MODE_LABELS) as [GameMode, string][]).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => handleGameModeChange(mode)}
              className={[
                'w-full py-2 px-3 rounded-lg text-xs font-bold border text-left transition-all',
                gameMode === mode
                  ? 'bg-green-600/30 border-green-500 text-green-300'
                  : 'bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-500',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-gray-600 text-xs mt-1.5">
          {gameMode === 'battle'   && 'GPS 安全圏が時間経過とともに縮小。圏外でダメージ。'}
          {gameMode === 'survival' && '1人の Hunter vs 複数 Survivors。発電機を全起動で Survivor 勝利。'}
          {gameMode === 'tactics'  && '3拠点をチームで奪い合う。時間終了時に拠点得点が多い方が勝利。'}
        </p>
      </div>

      {/* ── バトルモード専用: ストーム設定 ──────────────────────────────────── */}
      {gameMode === 'battle' && (
        <div className="space-y-3 border border-yellow-900/50 rounded-lg p-3 bg-yellow-900/10">
          <p className="text-yellow-600 text-xs font-semibold">⚡ ストーム設定</p>
          <SliderField
            label="初期安全圏半径" value={stormRadiusM} min={30} max={300} step={10}
            displayValue={`${stormRadiusM}m`}
            onChange={(v) => set({ stormRadiusM: v })}
          />
          <SliderField
            label="最終安全圏半径" value={stormFinalM} min={5} max={50} step={5}
            displayValue={`${stormFinalM}m`}
            onChange={(v) => set({ stormFinalM: Math.min(v, stormRadiusM - 10) })}
          />
        </div>
      )}

      {/* ── オブジェクト散布半径（サバイバル・タクティクス） ────────────────── */}
      {(gameMode === 'survival' || gameMode === 'tactics') && (
        <div className="space-y-2 border border-blue-900/50 rounded-lg p-3 bg-blue-900/10">
          <p className="text-blue-400 text-xs font-semibold">🗺️ フィールド設定</p>
          <SliderField
            label="オブジェクト散布半径" value={fieldRadiusM} min={20} max={200} step={10}
            displayValue={`${fieldRadiusM}m`}
            onChange={(v) => set({ fieldRadiusM: v })}
          />
          <p className="text-gray-600 text-xs">
            ホストの GPS 位置を中心に、この半径内にランダム配置されます。
          </p>
        </div>
      )}

      {/* ── 基本設定 ────────────────────────────────────────────────────────── */}
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

      {/* ── マーカーモード ────────────────────────────────────────────────── */}
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

      {/* ── チームモード ─────────────────────────────────────────────────── */}
      <label className="flex items-center justify-between cursor-pointer select-none">
        <div>
          <span className="text-gray-400 text-xs">チームモード</span>
          {teamMode && (
            <p className="text-gray-600 text-xs mt-0.5">
              🔴 P1・P3・P5 ／ 🔵 P2・P4・P6
            </p>
          )}
          {gameMode === 'tactics' && (
            <p className="text-yellow-700 text-xs mt-0.5">タクティクスは必須</p>
          )}
        </div>
        <div
          onClick={() => gameMode !== 'tactics' && set({ teamMode: !teamMode })}
          className={`w-10 h-6 rounded-full transition-colors relative ${
            teamMode ? 'bg-green-600' : 'bg-gray-700'
          } ${gameMode === 'tactics' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <span
            className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${teamMode ? 'left-5' : 'left-1'}`}
          />
        </div>
      </label>

      <div className="text-gray-600 text-xs space-y-0.5">
        <p>倒すのに必要な弾数: {hitDamage > 0 ? Math.ceil(100 / hitDamage) : '∞'}発</p>
        {durationMinutes > 0 && gameMode === 'battle'   && <p>時間切れ → ストームダメージで最後の生存者が勝利</p>}
        {durationMinutes > 0 && gameMode === 'survival' && <p>時間切れ → Survivor 勝利</p>}
        {durationMinutes > 0 && gameMode === 'tactics'  && <p>時間切れ → 獲得ポイントが多いチームが勝利</p>}
        {durationMinutes > 0 && gameMode === 'battle' && !teamMode && <p>最後の生存者が勝利</p>}
      </div>
    </div>
  )
}
