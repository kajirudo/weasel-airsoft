'use client'

import { useEffect, useRef, useState } from 'react'
import { scanFrame, computeFromCorners } from '@/lib/qr/detector'
import type { DetectedQR } from '@/types/game'
import type { QrCodeId } from '@/types/database'
import { RETICLE_RADIUS, QR_CODE_IDS } from '@/lib/game/constants'

// ─── BarcodeDetector 型宣言（TypeScript 標準ライブラリ未収録） ────────────────
interface BarcodeResult {
  rawValue: string
  cornerPoints: ReadonlyArray<{ x: number; y: number }>
}
interface BarcodeDetectorStatic {
  new(options: { formats: string[] }): {
    detect(source: HTMLCanvasElement): Promise<BarcodeResult[]>
  }
  getSupportedFormats(): Promise<string[]>
}
declare const BarcodeDetector: BarcodeDetectorStatic

function isBarcodeDetectorAvailable(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window
}

interface UseQRScannerParams {
  videoRef:  React.RefObject<HTMLVideoElement | null>
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  enabled:   boolean
}

export function useQRScanner({ videoRef, canvasRef, enabled }: UseQRScannerParams) {
  const [detectedQR, setDetectedQR] = useState<DetectedQR | null>(null)
  const rafRef      = useRef<number>(0)
  const prevRef     = useRef<{ qrCodeId: string | null; isInReticle: boolean }>({
    qrCodeId: null, isInReticle: false,
  })
  // BarcodeDetector 非同期呼び出し中フラグ（フレームの重複実行を防止）
  const detectingRef = useRef(false)
  // BarcodeDetector インスタンスをキャッシュ
  const bdRef = useRef<{ detect(source: HTMLCanvasElement): Promise<BarcodeResult[]> } | null>(null)

  useEffect(() => {
    if (!enabled) return

    // BarcodeDetector の初期化（対応ブラウザのみ）
    let useBD = false
    if (isBarcodeDetectorAvailable()) {
      try {
        bdRef.current = new BarcodeDetector({ formats: ['qr_code'] }) as { detect(source: HTMLCanvasElement): Promise<BarcodeResult[]> }
        useBD = true
      } catch {
        useBD = false
      }
    }

    function applyResult(result: DetectedQR | null) {
      const nextId = result?.qrCodeId ?? null
      const nextIn = result?.isInReticle ?? false
      if (nextId !== prevRef.current.qrCodeId || nextIn !== prevRef.current.isInReticle) {
        prevRef.current = { qrCodeId: nextId, isInReticle: nextIn }
        setDetectedQR(result)
      }
    }

    function scan() {
      const video  = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(scan)
        return
      }

      const w = video.videoWidth
      const h = video.videoHeight
      if (canvas.width !== w)  canvas.width  = w
      if (canvas.height !== h) canvas.height = h

      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) { rafRef.current = requestAnimationFrame(scan); return }

      ctx.drawImage(video, 0, 0, w, h)

      const reticleZone = { x: w / 2, y: h / 2, radius: RETICLE_RADIUS }

      if (useBD && bdRef.current && !detectingRef.current) {
        // ── BarcodeDetector パス（非同期・高速） ──
        detectingRef.current = true
        bdRef.current.detect(canvas)
          .then((results) => {
            if (results.length === 0) {
              applyResult(null)
              return
            }
            // QR_CODE_IDS に一致する最初の結果を使用
            for (const r of results) {
              if ((QR_CODE_IDS as string[]).includes(r.rawValue)) {
                applyResult(computeFromCorners(
                  Array.from(r.cornerPoints),
                  reticleZone,
                  r.rawValue as QrCodeId,
                ))
                return
              }
            }
            applyResult(null)
          })
          .catch(() => { applyResult(null) })
          .finally(() => { detectingRef.current = false })
      } else if (!useBD) {
        // ── jsQR フォールバック（同期） ──
        const imageData = ctx.getImageData(0, 0, w, h)
        applyResult(scanFrame(imageData, reticleZone))
      }

      rafRef.current = requestAnimationFrame(scan)
    }

    rafRef.current = requestAnimationFrame(scan)
    return () => cancelAnimationFrame(rafRef.current)
  }, [enabled, videoRef, canvasRef])

  return { detectedQR }
}
