'use client'

import { useEffect, useRef, useState } from 'react'
import { scanFrame } from '@/lib/qr/detector'
import type { DetectedQR } from '@/types/game'
import { RETICLE_RADIUS } from '@/lib/game/constants'

interface UseQRScannerParams {
  videoRef: React.RefObject<HTMLVideoElement | null>
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  enabled: boolean
}

export function useQRScanner({ videoRef, canvasRef, enabled }: UseQRScannerParams) {
  const [detectedQR, setDetectedQR] = useState<DetectedQR | null>(null)
  const rafRef = useRef<number>(0)
  // 前回の検出結果を保持し、変化がなければ setState をスキップ
  const prevRef = useRef<{ qrCodeId: string | null; isInReticle: boolean }>({
    qrCodeId: null,
    isInReticle: false,
  })

  useEffect(() => {
    if (!enabled) return

    function scan() {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(scan)
        return
      }

      const w = video.videoWidth
      const h = video.videoHeight
      if (canvas.width !== w) canvas.width = w
      if (canvas.height !== h) canvas.height = h

      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) {
        rafRef.current = requestAnimationFrame(scan)
        return
      }

      ctx.drawImage(video, 0, 0, w, h)
      const imageData = ctx.getImageData(0, 0, w, h)

      const result = scanFrame(imageData, { x: w / 2, y: h / 2, radius: RETICLE_RADIUS })

      // 検出ID と レティクル内フラグの両方が前回と同じならスキップ
      const nextId = result?.qrCodeId ?? null
      const nextIn = result?.isInReticle ?? false
      if (nextId !== prevRef.current.qrCodeId || nextIn !== prevRef.current.isInReticle) {
        prevRef.current = { qrCodeId: nextId, isInReticle: nextIn }
        setDetectedQR(result)
      }

      rafRef.current = requestAnimationFrame(scan)
    }

    rafRef.current = requestAnimationFrame(scan)
    return () => cancelAnimationFrame(rafRef.current)
  }, [enabled, videoRef, canvasRef])

  return { detectedQR }
}
