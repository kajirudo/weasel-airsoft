'use client'

/**
 * RadarOverlay — ゲーム画面左上のミニマップ
 *
 * ── 仕様 ──────────────────────────────────────────────────────────────────────
 *   - 北が常に上（方位ロック）
 *   - 自分 = 中央の白い三角
 *   - 他プレイヤー = QR_COLORS に対応した色のドット（生存者のみ）
 *   - オブジェクト = 種別アイコン（💊/⚡/🔋/🏴）
 *   - バトルモード: ストーム安全圏をリング表示
 *   - 範囲外（> RADAR_RANGE_M）は非表示
 *   - GPS 未取得 / 位置情報なし → "GPS" ラベル
 *
 * ── 座標計算 ──────────────────────────────────────────────────────────────────
 *   1° 緯度 ≈ 111,320 m / 1° 経度 ≈ 111,320 × cos(lat) m
 *   (dx_m, dy_m) → canvas: px = cx + dx/range*R, py = cy - dy/range*R
 */

import { useEffect, useRef, memo } from 'react'
import type { Player, Game, GameNpc } from '@/types/database'
import type { GeoPosition }            from '@/hooks/useRadar'
import type { ObjectiveWithDist }      from '@/hooks/useObjectives'
import type { StormState }             from '@/hooks/useStorm'
import { QR_COLORS }                   from '@/lib/game/constants'

// ── 定数 ──────────────────────────────────────────────────────────────────────
const R             = 72   // レーダー円の半径（px）
const DOT_R         = 5    // プレイヤードット半径（px）
const RADAR_RANGE_M = 100  // 表示する実世界範囲（m）

const CANVAS_SIZE = (R + 4) * 2

const OBJ_ICONS: Record<string, string> = {
  medkit:        '💊',
  damage_boost:  '⚡',
  generator:     '🔋',
  control_point: '🏴',
}

interface RadarOverlayProps {
  selfPlayerId: string
  players:      Player[]
  geoPos:       GeoPosition | null
  gpsAvailable: boolean | null
  objectives?:  ObjectiveWithDist[]
  storm?:       StormState
  game?:        Game | null
  /** ハンティングモード: NPC 位置 */
  npc?:         GameNpc | null
  /** マップの表示位置。デフォルトは右下 */
  position?:    'top-left' | 'bottom-right'
}

export const RadarOverlay = memo(function RadarOverlay({
  selfPlayerId,
  players,
  geoPos,
  gpsAvailable,
  objectives = [],
  storm,
  game,
  npc,
  position = 'bottom-right',
}: RadarOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W  = canvas.width
    const H  = canvas.height
    const cx = W / 2
    const cy = H / 2

    ctx.clearRect(0, 0, W, H)

    // ── 背景円 ──────────────────────────────────────────────────────────────
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.restore()

    // ── 範囲リング ───────────────────────────────────────────────────────────
    for (const frac of [0.5, 1.0]) {
      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, R * frac, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.restore()
    }

    // ── クロスヘア ──────────────────────────────────────────────────────────
    ctx.save()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy)
    ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R)
    ctx.stroke()
    ctx.restore()

    if (geoPos) {
      const mPerDegLat = 111_320
      const mPerDegLng = 111_320 * Math.cos(geoPos.lat * (Math.PI / 180))

      // ── ストーム安全圏リング（バトルモード） ─────────────────────────────
      if (game?.game_mode === 'battle' && storm?.safeRadiusM != null &&
          game.storm_center_lat != null && game.storm_center_lng != null) {
        const dx_m = (game.storm_center_lng - geoPos.lng) * mPerDegLng
        const dy_m = (game.storm_center_lat - geoPos.lat) * mPerDegLat
        const scx  = cx + (dx_m / RADAR_RANGE_M) * R
        const scy  = cy - (dy_m / RADAR_RANGE_M) * R
        const rPx  = (storm.safeRadiusM / RADAR_RANGE_M) * R

        ctx.save()
        ctx.beginPath()
        ctx.arc(scx, scy, rPx, 0, Math.PI * 2)
        ctx.strokeStyle = storm.isOutsideStorm
          ? 'rgba(239,68,68,0.9)'   // 圏外 → 赤
          : 'rgba(59,130,246,0.7)'   // 圏内 → 青
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 3])
        ctx.stroke()
        ctx.setLineDash([])
        ctx.restore()
      }

      // clip 開始
      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, R - 1, 0, Math.PI * 2)
      ctx.clip()

      // ── オブジェクトアイコン ──────────────────────────────────────────────
      for (const obj of objectives) {
        // 獲得済みアイテムや起動済み発電機はスキップ
        if ((obj.type === 'medkit' || obj.type === 'damage_boost') && obj.is_claimed) continue
        if (obj.type === 'generator' && obj.is_activated) continue

        const dx_m = (obj.lng - geoPos.lng) * mPerDegLng
        const dy_m = (obj.lat - geoPos.lat) * mPerDegLat
        const dist = Math.sqrt(dx_m ** 2 + dy_m ** 2)
        if (dist > RADAR_RANGE_M) continue

        const px = cx + (dx_m / RADAR_RANGE_M) * R
        const py = cy - (dy_m / RADAR_RANGE_M) * R

        // 拠点は占領チームの色で塗る
        if (obj.type === 'control_point') {
          const cpColor = obj.controlled_by === 'red'  ? '#ef4444'
                        : obj.controlled_by === 'blue' ? '#3b82f6'
                        : '#9ca3af'
          ctx.save()
          ctx.beginPath()
          ctx.arc(px, py, 5, 0, Math.PI * 2)
          ctx.fillStyle = cpColor
          ctx.fill()
          ctx.strokeStyle = 'white'
          ctx.lineWidth = 1
          ctx.stroke()
          ctx.restore()
        } else {
          ctx.save()
          ctx.font = '10px serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(OBJ_ICONS[obj.type] ?? '?', px, py)
          ctx.restore()
        }
      }

      // ── プレイヤードット ──────────────────────────────────────────────────
      for (const p of players) {
        if (p.id === selfPlayerId) continue
        if (!p.is_alive)           continue
        if (p.lat == null || p.lng == null) continue

        const dx_m = (p.lng - geoPos.lng) * mPerDegLng
        const dy_m = (p.lat - geoPos.lat) * mPerDegLat
        const dist = Math.sqrt(dx_m ** 2 + dy_m ** 2)
        if (dist > RADAR_RANGE_M) continue

        const px = cx + (dx_m / RADAR_RANGE_M) * R
        const py = cy - (dy_m / RADAR_RANGE_M) * R

        const color = QR_COLORS[p.qr_code_id] ?? '#ffffff'
        ctx.beginPath()
        ctx.arc(px, py, DOT_R, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'
        ctx.lineWidth = 1
        ctx.stroke()
      }

      // ── NPC（青鬼）マーカー ───────────────────────────────────────────────
      if (npc?.lat != null && npc?.lng != null) {
        const dx_m = (npc.lng - geoPos.lng) * mPerDegLng
        const dy_m = (npc.lat - geoPos.lat) * mPerDegLat
        const dist = Math.sqrt(dx_m ** 2 + dy_m ** 2)
        const px   = cx + (Math.min(dx_m, RADAR_RANGE_M * Math.sign(dx_m)) / RADAR_RANGE_M) * R
        const py   = cy - (Math.min(dy_m, RADAR_RANGE_M * Math.sign(dy_m)) / RADAR_RANGE_M) * R

        // 範囲外でも端に表示（clamp して矢印的に使う）
        const now   = Date.now()
        const isStunned   = !!(npc.stun_until    && new Date(npc.stun_until).getTime()    > now)
        const isConfused  = !!(npc.confused_until && new Date(npc.confused_until).getTime() > now)
        const isLunging   = !!(npc.lunge_fire_at  && new Date(npc.lunge_fire_at).getTime()  > now)

        ctx.save()
        ctx.font = `${dist > RADAR_RANGE_M ? 12 : 16}px serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        // スタン中は点滅（tick で交互）
        if (!isStunned || Math.floor(Date.now() / 400) % 2 === 0) {
          ctx.fillText('👹', px, py)
        }

        // ランジ予告 → 赤い円
        if (isLunging && dist <= RADAR_RANGE_M) {
          const rPx = (npc.lunge_radius_m / RADAR_RANGE_M) * R
          ctx.beginPath()
          ctx.arc(px, py, rPx, 0, Math.PI * 2)
          ctx.strokeStyle = 'rgba(239,68,68,0.8)'
          ctx.lineWidth   = 2
          ctx.setLineDash([3, 2])
          ctx.stroke()
          ctx.setLineDash([])
        }

        // ステータスラベル
        const label = isStunned ? 'STUN' : isConfused ? '？' : null
        if (label) {
          ctx.font = 'bold 8px monospace'
          ctx.fillStyle = isStunned ? '#fbbf24' : '#93c5fd'
          ctx.fillText(label, px, py + 10)
        }

        ctx.restore()
      }

      ctx.restore()  // clip 解除
    }

    // ── 自分（中央の白三角、heading 方向を向く）────────────────────────────
    ctx.save()
    ctx.translate(cx, cy)
    if (geoPos) {
      ctx.rotate((geoPos.heading * Math.PI) / 180)
    }
    ctx.beginPath()
    ctx.moveTo(0, -9)
    ctx.lineTo(6, 7)
    ctx.lineTo(-6, 7)
    ctx.closePath()
    ctx.fillStyle = 'white'
    ctx.fill()
    ctx.restore()

    // ── GPS なしラベル ──────────────────────────────────────────────────────
    if (gpsAvailable === false || (gpsAvailable === true && !geoPos)) {
      ctx.save()
      ctx.font = 'bold 10px monospace'
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText('GPS', cx, cy + R - 4)
      ctx.restore()
    }

    // ── 範囲ラベル ──────────────────────────────────────────────────────────
    ctx.save()
    ctx.font = '8px monospace'
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'bottom'
    ctx.fillText(`${RADAR_RANGE_M}m`, cx + R - 2, cy + R - 2)
    ctx.restore()

  }, [selfPlayerId, players, geoPos, gpsAvailable, objectives, storm, game, npc])

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_SIZE}
      height={CANVAS_SIZE}
      className={`fixed z-[60] pointer-events-none ${position === 'top-left' ? 'top-4 left-4' : 'bottom-20 right-4'}`}
      aria-hidden="true"
    />
  )
})
