'use client'

import type { MarkerMode, GameMode, BotDifficulty } from '@/lib/game/constants'
import {
  GAME_MODE_LABELS,
  HUNTING_SOLO_HP, HUNTING_SOLO_SPEED, HUNTING_SOLO_LOCKON,
  HUNTING_DUO_HP,  HUNTING_DUO_SPEED,  HUNTING_DUO_LOCKON,
  HUNTING_NPC_HP_BASE, HUNTING_NPC_SPEED_BASE, HUNTING_LOCKON_SEC_BASE,
  HUNTING_BACKSTAB_RANGE_M, HUNTING_BACKSTAB_ANGLE,
  HUNTING_ATTACK_COOLDOWN_MS,
  BOT_DIFFICULTY_LABELS, BOT_SHOOT_RANGE_M,
} from '@/lib/game/constants'

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
  // Traitor モード
  traitorCount:    number
  sheriffEnabled:  boolean
  // ソロプレイ
  soloMode:        boolean
  botCount:        number
  botDifficulty:   BotDifficulty
}

interface GameSettingsProps extends GameSettingsValues {
  onChange:      (settings: GameSettingsValues) => void
  /** ロビーにいる実プレイヤー数（ソロ判定の参考表示用） */
  playerCount?:  number
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
  traitorCount, sheriffEnabled,
  soloMode, botCount, botDifficulty,
  playerCount,
  onChange,
}: GameSettingsProps) {
  const set = (partial: Partial<GameSettingsValues>) =>
    onChange({
      hitDamage, shootCooldown, durationMinutes, teamMode, markerMode,
      gameMode, stormRadiusM, stormFinalM, fieldRadiusM,
      traitorCount, sheriffEnabled,
      soloMode, botCount, botDifficulty,
      ...partial,
    })

  function handleGameModeChange(mode: GameMode) {
    // タクティクスはチームモード強制オン、Traitor はチームモード無効
    const newTeamMode = mode === 'tactics' ? true : mode === 'traitor' ? false : teamMode
    // hunting はソロモード無効（既に NPC が存在するため）
    const newSolo = mode === 'hunting' ? false : soloMode
    set({ gameMode: mode, teamMode: newTeamMode, soloMode: newSolo })
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
          {gameMode === 'traitor'  && '中に潜むスパイを投票で追放せよ。タスク完了か全員追放で Crew 勝利。'}
          {gameMode === 'hunting'  && 'プレイヤー全員 vs NPC（鬼）。背後攻撃でHPをゼロにするか、封印QRを全スキャンで勝利。捕まったら脱落。'}
        </p>
      </div>

      {/* ── ハンティングモード専用設定 ────────────────────────────────────── */}
      {gameMode === 'hunting' && (
        <div className="space-y-2 border border-purple-900/50 rounded-lg p-3 bg-purple-900/10">
          <p className="text-purple-400 text-xs font-semibold">👹 ハンティング 設定</p>
          <p className="text-gray-500 text-xs leading-snug">
            NPCのHP・速度・ロックオン時間はプレイヤー人数に応じて自動調整されます。
          </p>
          <div className="grid grid-cols-3 gap-2 text-center">
            {([
              { label: '1人',  hp: HUNTING_SOLO_HP,     speed: HUNTING_SOLO_SPEED,     lock: HUNTING_SOLO_LOCKON },
              { label: '2人',  hp: HUNTING_DUO_HP,      speed: HUNTING_DUO_SPEED,      lock: HUNTING_DUO_LOCKON },
              { label: '3人+', hp: HUNTING_NPC_HP_BASE, speed: HUNTING_NPC_SPEED_BASE, lock: HUNTING_LOCKON_SEC_BASE },
            ] as const).map(s => (
              <div key={s.label} className="bg-gray-800/60 rounded-lg p-2 space-y-0.5">
                <p className="text-purple-300 font-bold text-[10px]">{s.label}</p>
                <p className="text-gray-400 text-[10px]">HP {s.hp}</p>
                <p className="text-gray-400 text-[10px]">{s.speed}m/s</p>
                <p className="text-gray-400 text-[10px]">捕食 {s.lock}s</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-[10px] text-gray-500 bg-gray-900/50 rounded-lg p-2">
            <p>🎯 背後攻撃射程: <span className="text-purple-300">{HUNTING_BACKSTAB_RANGE_M}m</span></p>
            <p>📐 背後判定角: <span className="text-purple-300">±{HUNTING_BACKSTAB_ANGLE}°</span></p>
            <p>🔄 攻撃CD: <span className="text-purple-300">{HUNTING_ATTACK_COOLDOWN_MS / 1000}s</span></p>
          </div>
          <SliderField
            label="封印QR数" value={fieldRadiusM} min={2} max={8} step={1}
            displayValue={`${fieldRadiusM}個`}
            onChange={(v) => set({ fieldRadiusM: v })}
          />
          <p className="text-gray-600 text-xs">
            封印QR を全て "スキャン" するとプレイヤー勝利。封印QRは半径 {fieldRadiusM * 20}m 内に散布されます。
          </p>
        </div>
      )}

      {/* ── スパイモード専用設定 ──────────────────────────────────────────── */}
      {gameMode === 'traitor' && (
        <div className="space-y-3 border border-red-900/50 rounded-lg p-3 bg-red-900/10">
          <p className="text-red-400 text-xs font-semibold">🕵️ スパイ 設定</p>
          <SliderField
            label="スパイ 人数" value={traitorCount} min={1} max={2} step={1}
            displayValue={`${traitorCount}人`}
            onChange={(v) => set({ traitorCount: v })}
          />
          <p className="text-gray-600 text-xs">
            参加人数の 1/4 程度を目安にしてください（4人→1人、6人→1〜2人）
          </p>
          {/* Sheriff 有効 */}
          <label className="flex items-center justify-between cursor-pointer select-none">
            <div>
              <span className="text-gray-400 text-xs">Sheriff を有効にする</span>
              <p className="text-gray-600 text-xs mt-0.5">🔰 特殊能力で Crew の中から1人選出</p>
            </div>
            <div
              onClick={() => set({ sheriffEnabled: !sheriffEnabled })}
              className={`w-10 h-6 rounded-full transition-colors relative cursor-pointer ${
                sheriffEnabled ? 'bg-yellow-600' : 'bg-gray-700'
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${sheriffEnabled ? 'left-5' : 'left-1'}`}
              />
            </div>
          </label>
          <SliderField
            label="オブジェクト散布半径" value={fieldRadiusM} min={20} max={200} step={10}
            displayValue={`${fieldRadiusM}m`}
            onChange={(v) => set({ fieldRadiusM: v })}
          />
          <p className="text-gray-600 text-xs">
            ホストの GPS 位置を中心に発電機・アイテムを散布します。
          </p>
        </div>
      )}

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

      {/* ── ソロプレイ ───────────────────────────────────────────────────────── */}
      {gameMode !== 'hunting' && (
        <div className="space-y-3 border border-cyan-900/50 rounded-lg p-3 bg-cyan-900/10">
          <label className="flex items-center justify-between cursor-pointer select-none">
            <div>
              <span className="text-cyan-300 text-xs font-semibold">🤖 ソロプレイ（CPU 対戦）</span>
              <p className="text-gray-600 text-xs mt-0.5">
                {soloMode
                  ? `CPU ${botCount}体と対戦。GPS 近接で自動攻撃。`
                  : '1人でもプレイ可能。CPUボットを追加します。'}
              </p>
              {soloMode && playerCount != null && playerCount <= 1 && (
                <p className="text-cyan-600 text-xs mt-0.5">💡 あなた 1 人 + CPU {botCount}体でスタート</p>
              )}
            </div>
            <div
              onClick={() => set({ soloMode: !soloMode })}
              className={`w-10 h-6 rounded-full transition-colors relative cursor-pointer flex-shrink-0 ${
                soloMode ? 'bg-cyan-600' : 'bg-gray-700'
              }`}
            >
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${soloMode ? 'left-5' : 'left-1'}`} />
            </div>
          </label>

          {soloMode && (
            <>
              <SliderField
                label="CPU 数" value={botCount} min={1} max={8} step={1}
                displayValue={`${botCount}体`}
                onChange={(v) => set({ botCount: v })}
              />
              <div>
                <p className="text-gray-400 text-xs mb-1.5">CPU 難易度</p>
                <div className="flex gap-1.5">
                  {(Object.entries(BOT_DIFFICULTY_LABELS) as [import('@/lib/game/constants').BotDifficulty, string][]).map(([d, label]) => (
                    <button
                      key={d}
                      onClick={() => set({ botDifficulty: d })}
                      className={[
                        'flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all',
                        botDifficulty === d
                          ? 'bg-cyan-600/30 border-cyan-500 text-cyan-300'
                          : 'bg-gray-800 border-gray-700 text-gray-500',
                      ].join(' ')}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="text-gray-600 text-xs space-y-0.5 bg-gray-900/50 rounded-lg p-2">
                <p>🎯 攻撃射程: <span className="text-cyan-400">{BOT_SHOOT_RANGE_M}m（GPS 近接）</span></p>
                <p className="text-gray-700">CPU は QR スキャン不要・近づくと自動攻撃</p>
                <p className="text-gray-700">あなたも近接ボタンで CPU を攻撃できます</p>
              </div>
            </>
          )}
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
          {gameMode === 'traitor' && (
            <p className="text-red-700 text-xs mt-0.5">スパイモードは無効</p>
          )}
        </div>
        <div
          onClick={() => gameMode !== 'tactics' && gameMode !== 'traitor' && set({ teamMode: !teamMode })}
          className={`w-10 h-6 rounded-full transition-colors relative ${
            teamMode ? 'bg-green-600' : 'bg-gray-700'
          } ${(gameMode === 'tactics' || gameMode === 'traitor') ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
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
        {durationMinutes > 0 && gameMode === 'traitor'  && <p>時間切れ → タスク未完ならスパイ勝利</p>}
        {durationMinutes > 0 && gameMode === 'battle' && !teamMode && <p>最後の生存者が勝利</p>}
      </div>
    </div>
  )
}
