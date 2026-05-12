'use client'

/**
 * RadarOverlay — ゲーム画面左上のミニマップ
 *
 * ── 仕様 ──────────────────────────────────────────────────────────────────────
 *   - 北が常に上（方位ロック）
 *   - 自分 = 中央の白い三角
 *   - 他プレイヤー = QR_COLORS に対応した色のドット
 *   - 範囲外（> RADAR_RANGE_M）は非表示
 *   - GPS 未取得 / 位置情報なし → レーダー円に "GPS" ラベルを表示
 *
 * ── 座標計算 ──────────────────────────────────────────────────────────────────
 *   1° の緯度 ≈ 111,320 m（地球半径から近似）
 *   1° の経度 ≈ 111,320 × cos(lat) m
 *   (dx_m, dy_m) → canvas (px, py) = center + (dx_m / range * R, -dy_m / range * R)
 *     ※ canvas Y 軸は下向きなので北（+dy）は -py 方向
 */

import { useEffect, useRef, memo } from 'react'
import type { Player }     from '@/types/database'
import type { GeoPosition } from '@/hooks/useRadar'
import { QR_COLORS }       from '@/lib/game/constants'

// ── 定数 ──────────────────────────────────────────────────────────────────────
const R             = 72   // レーダー円の半径（px）
const DOT_R         = 5    // プレイヤードット半径（px）
const RADAR_RANGE_M = 80   // 表示する実世界範囲（m）。端 = 80m

const CANVAS_SIZE = (R + 4) * 2  // 余白 4px + 円

interface RadarOverlayProps {
  selfPlayerId: string
  players:      Player[]
  geoPos:       GeoPosition | null
  gpsAvailable: boolean | null  // null=未確認, false=不可, true=利用可能
}

export const RadarOverlay = memo(function RadarOverlay({
  selfPlayerId,
  players,
  geoPos,
  gpsAvailable,
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

    // ── 範囲リング（40m / 80m）─────────────────────────────────────────────
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

    // ── プレイヤードット（GPS 位置が有効な場合のみ）─────────────────────────
    if (geoPos) {
      const mPerDegLat = 111_320
      const mPerDegLng = 111_320 * Math.cos(geoPos.lat * (Math.PI / 180))

      // clip to circle
      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, R - 1, 0, Math.PI * 2)
      ctx.clip()

      for (const p of players) {
        if (p.id === selfPlayerId) continue
        if (!p.is_alive)           continue
        if (p.lat == null || p.lng == null) continue

        const dx_m = (p.lng - geoPos.lng) * mPerDegLng  // 東方向
        const dy_m = (p.lat - geoPos.lat) * mPerDegLat  // 北方向

        const dist = Math.sqrt(dx_m ** 2 + dy_m ** 2)
        if (dist > RADAR_RANGE_M) continue  // 範囲外は非表示

        const px = cx + (dx_m / RADAR_RANGE_M) * R
        const py = cy - (dy_m / RADAR_RANGE_M) * R  // canvas Y 軸反転

        const color = QR_COLORS[p.qr_code_id] ?? '#ffffff'
        ctx.beginPath()
        ctx.arc(px, py, DOT_R, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'
        ctx.lineWidth = 1
        ctx.stroke()
      }

      ctx.restore()
    }

    // ── 自分（中央の白三角）────────────────────────────────────────────────
    ctx.save()
    ctx.translate(cx, cy)
    ctx.beginPath()
    ctx.moveTo(0, -9)   // 頂点（北=上）
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

    // ── 範囲ラベル（右下）──────────────────────────────────────────────────
    ctx.save()
    ctx.font = '8px monospace'
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'bottom'
    ctx.fillText(`${RADAR_RANGE_M}m`, cx + R - 2, cy + R - 2)
    ctx.restore()

  }, [selfPlayerId, players, geoPos, gpsAvailable])

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_SIZE}
      height={CANVAS_SIZE}
      className="absolute top-4 left-4 z-20 pointer-events-none"
      aria-hidden="true"
    />
  )
})
