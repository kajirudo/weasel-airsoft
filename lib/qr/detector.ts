import jsQR from 'jsqr'
import type { DetectedQR, ReticleZone } from '@/types/game'
import type { QrCodeId } from '@/types/database'
import { QR_CODE_IDS } from '@/lib/game/constants'

export function scanFrame(
  imageData: ImageData,
  reticleZone: ReticleZone
): DetectedQR | null {
  const result = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: 'dontInvert',
  })

  if (!result) return null
  if (!(QR_CODE_IDS as string[]).includes(result.data)) return null

  const { topLeftCorner: tl, topRightCorner: tr, bottomRightCorner: br, bottomLeftCorner: bl } =
    result.location

  const centroidX = (tl.x + tr.x + br.x + bl.x) / 4
  const centroidY = (tl.y + tr.y + br.y + bl.y) / 4

  const dx = centroidX - reticleZone.x
  const dy = centroidY - reticleZone.y
  const isInReticle = Math.sqrt(dx * dx + dy * dy) < reticleZone.radius

  return {
    qrCodeId: result.data as QrCodeId,
    centroidX,
    centroidY,
    isInReticle,
  }
}
