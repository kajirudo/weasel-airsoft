import jsQR from 'jsqr'
import type { DetectedQR, ReticleZone } from '@/types/game'
import type { QrCodeId } from '@/types/database'
import { QR_CODE_IDS } from '@/lib/game/constants'

/** 4隅座標からレティクル判定を含む DetectedQR を計算する（jsQR / BarcodeDetector 共通） */
export function computeFromCorners(
  corners: Array<{ x: number; y: number }>,
  reticleZone: ReticleZone,
  qrCodeId: QrCodeId,
): DetectedQR {
  const centroidX = corners.reduce((s, c) => s + c.x, 0) / corners.length
  const centroidY = corners.reduce((s, c) => s + c.y, 0) / corners.length
  const dx = centroidX - reticleZone.x
  const dy = centroidY - reticleZone.y
  return {
    qrCodeId,
    centroidX,
    centroidY,
    isInReticle: Math.sqrt(dx * dx + dy * dy) < reticleZone.radius,
  }
}

/** jsQR フォールバック用スキャン（同期） */
export function scanFrame(
  imageData: ImageData,
  reticleZone: ReticleZone,
): DetectedQR | null {
  const result = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: 'dontInvert',
  })
  if (!result) return null
  if (!(QR_CODE_IDS as string[]).includes(result.data)) return null

  const { topLeftCorner: tl, topRightCorner: tr, bottomRightCorner: br, bottomLeftCorner: bl } =
    result.location

  return computeFromCorners([tl, tr, br, bl], reticleZone, result.data as QrCodeId)
}
