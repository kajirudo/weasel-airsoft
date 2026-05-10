/**
 * killcam-capture.ts
 * カメラフレームにレティクル・タイムスタンプ・証拠ラベルを合成し JPEG Blob を返す
 * ※ ブラウザ専用（canvas API 使用）
 */

export interface KillcamCaptureOptions {
  shooterName: string
  timestamp:   Date
}

export async function compositeKillcam(
  sourceCanvas: HTMLCanvasElement,
  opts: KillcamCaptureOptions,
): Promise<Blob> {
  const W = sourceCanvas.width  || 640
  const H = sourceCanvas.height || 480

  const out = document.createElement('canvas')
  out.width  = W
  out.height = H
  const ctx = out.getContext('2d')!

  // ① カメラフレームを描画
  ctx.drawImage(sourceCanvas, 0, 0)

  // ② ビネット（周辺暗化）
  const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.78)
  vignette.addColorStop(0, 'rgba(0,0,0,0)')
  vignette.addColorStop(1, 'rgba(0,0,0,0.60)')
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, W, H)

  // ③ レティクル（中央）
  const cx = W / 2
  const cy = H / 2
  // 画面全体の約11%をレティクル半径とする（1280×720想定でほぼゲーム内レティクルと同じ比率）
  const r  = Math.min(W, H) * 0.11

  ctx.save()
  ctx.strokeStyle = 'rgba(255, 55, 55, 0.92)'
  ctx.lineWidth   = Math.max(2, W / 320)

  // 外周円
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()

  // 十字アーム（4本）
  const gap = r * 0.38
  const arm = r * 0.55
  const lines: [number, number, number, number][] = [
    [cx, cy - r - arm, cx, cy - r - gap],  // 上
    [cx, cy + r + gap, cx, cy + r + arm],  // 下
    [cx - r - arm, cy, cx - r - gap, cy],  // 左
    [cx + r + gap, cy, cx + r + arm, cy],  // 右
  ]
  for (const [x1, y1, x2, y2] of lines) {
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }

  // 中心ドット
  ctx.beginPath()
  ctx.arc(cx, cy, Math.max(2.5, W / 256), 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255, 55, 55, 0.92)'
  ctx.fill()

  ctx.restore()

  // ④ 上部バナー「HIT CONFIRMED」
  const bannerH    = Math.round(H * 0.065)
  const bannerFont = Math.round(bannerH * 0.52)
  ctx.fillStyle = 'rgba(170, 0, 0, 0.82)'
  ctx.fillRect(0, 0, W, bannerH)
  ctx.fillStyle    = '#ffffff'
  ctx.font         = `bold ${bannerFont}px monospace`
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('▶  HIT CONFIRMED  ◀', W / 2, bannerH / 2)

  // ⑤ 射手名（右上）
  const metaFont = Math.round(bannerFont * 0.65)
  const metaY    = bannerH + Math.round(H * 0.02)
  ctx.font         = `${metaFont}px monospace`
  ctx.textAlign    = 'right'
  ctx.textBaseline = 'top'
  const shooterLabel = `BY  ${opts.shooterName.toUpperCase()}`
  const labelW = ctx.measureText(shooterLabel).width + metaFont
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(W - labelW - 6, metaY - 2, labelW + 6, metaFont + 6)
  ctx.fillStyle = '#facc15'
  ctx.fillText(shooterLabel, W - 8, metaY)

  // ⑥ タイムスタンプ（左下）
  const tsText = opts.timestamp.toLocaleString('ja-JP', {
    year:   'numeric',
    month:  '2-digit',
    day:    '2-digit',
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const tsFont = metaFont
  const tsY    = H - Math.round(H * 0.065)
  ctx.font         = `${tsFont}px monospace`
  ctx.textAlign    = 'left'
  ctx.textBaseline = 'top'
  const tsW = ctx.measureText(tsText).width + tsFont
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(0, tsY - 2, tsW + 6, tsFont + 6)
  ctx.fillStyle = '#86efac'
  ctx.fillText(tsText, 8, tsY)

  // ⑦ 証拠ラベル（右下）
  const evidenceText = 'WEASEL AIRSOFT — EVIDENCE'
  ctx.font      = `${tsFont}px monospace`
  ctx.textAlign = 'right'
  const evW = ctx.measureText(evidenceText).width + tsFont
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(W - evW - 6, tsY - 2, evW + 6, tsFont + 6)
  ctx.fillStyle = '#94a3b8'
  ctx.fillText(evidenceText, W - 8, tsY)

  // JPEG 変換
  return new Promise<Blob>((resolve, reject) => {
    out.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
      'image/jpeg',
      0.88,
    )
  })
}
