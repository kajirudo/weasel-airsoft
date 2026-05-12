'use client'

/**
 * useScanner — QR / ArUco 統合スキャナーフック
 *
 * ─── ライブラリ競合防止 ───────────────────────────────────────────────────────
 * mode = 'qr'   → BarcodeDetector / jsQR のみ使用。js-aruco は一切ロードしない。
 * mode = 'aruco' → js-aruco のみ使用。BarcodeDetector / jsQR は一切起動しない。
 *
 * mode が変わると useEffect のクリーンアップ（rAF キャンセル）→ 再起動が走り、
 * 前モードのリソースは完全に解放される。
 *
 * ─── パフォーマンス ────────────────────────────────────────────────────────────
 * ArUco (js-aruco) は同期処理で重いため 2 フレームに 1 回だけ実行する。
 * QR (BarcodeDetector) は非同期なので毎フレーム起動しても重複防止フラグで制御。
 * QR (jsQR フォールバック) は同期・軽量なので毎フレーム実行。
 */

import { useEffect, useRef, useState } from 'react'
import { scanFrame, computeFromCorners } from '@/lib/qr/detector'
import { getDetector, detectAruco }      from '@/lib/detector/arucoDetector'
import type { DetectedQR, ReticleZone }  from '@/types/game'
import type { QrCodeId }                 from '@/types/database'
import type { MarkerMode }               from '@/lib/game/constants'
import { RETICLE_RADIUS, QR_CODE_IDS }   from '@/lib/game/constants'

// ─── BarcodeDetector 型宣言（TypeScript 標準ライブラリ未収録） ────────────────
interface BarcodeResult {
  rawValue:     string
  cornerPoints: ReadonlyArray<{ x: number; y: number }>
}
interface BarcodeDetectorStatic {
  new(options: { formats: string[] }): {
    detect(source: HTMLCanvasElement): Promise<BarcodeResult[]>
  }
}
declare const BarcodeDetector: BarcodeDetectorStatic

function isBarcodeDetectorAvailable(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window
}

interface UseScannerParams {
  videoRef:  React.RefObject<HTMLVideoElement | null>
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  enabled:   boolean
  mode:      MarkerMode
}

export function useScanner({ videoRef, canvasRef, enabled, mode }: UseScannerParams) {
  const [detectedQR, setDetectedQR] = useState<DetectedQR | null>(null)

  const rafRef       = useRef<number>(0)
  const prevRef      = useRef<{ qrCodeId: string | null; isInReticle: boolean }>({
    qrCodeId: null, isInReticle: false,
  })

  // ── QR モード専用リソース ─────────────────────────────────────────────────
  const detectingRef = useRef(false)  // BarcodeDetector 非同期呼び出し中フラグ
  const bdRef        = useRef<{ detect(s: HTMLCanvasElement): Promise<BarcodeResult[]> } | null>(null)

  // ── ArUco モード専用リソース ──────────────────────────────────────────────
  const arucoRef     = useRef<import('js-aruco').AR.Detector | null>(null)
  const frameCount   = useRef(0)  // ArUco フレームスキップ用カウンタ

  useEffect(() => {
    if (!enabled) return

    // ── QR モード初期化（ArUco リソースはセットしない） ─────────────────
    let useBD = false
    if (mode === 'qr') {
      bdRef.current    = null
      arucoRef.current = null
      detectingRef.current = false

      if (isBarcodeDetectorAvailable()) {
        try {
          bdRef.current = new BarcodeDetector({ formats: ['qr_code'] }) as {
            detect(source: HTMLCanvasElement): Promise<BarcodeResult[]>
          }
          useBD = true
        } catch {
          useBD = false
        }
      }
    }

    // ── ArUco モード初期化（QR リソースはセットしない） ─────────────────
    if (mode === 'aruco') {
      bdRef.current        = null    // BarcodeDetector を明示的に無効化
      detectingRef.current = false
      frameCount.current   = 0

      getDetector()
        .then((d) => { arucoRef.current = d })
        .catch(() => { /* 読み込み失敗は無視、次フレームで再試行 */ })
    }

    // ── 検出結果を state に反映（変化があるときのみ） ─────────────────────
    function applyResult(result: DetectedQR | null) {
      const nextId = result?.qrCodeId ?? null
      const nextIn = result?.isInReticle ?? false
      if (
        nextId !== prevRef.current.qrCodeId ||
        nextIn !== prevRef.current.isInReticle
      ) {
        prevRef.current = { qrCodeId: nextId, isInReticle: nextIn }
        setDetectedQR(result)
      }
    }

    // ── rAF スキャンループ ─────────────────────────────────────────────────
    function scan() {
      const video  = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(scan)
        return
      }

      const w = video.videoWidth
      const h = video.videoHeight
      if (canvas.width  !== w) canvas.width  = w
      if (canvas.height !== h) canvas.height = h

      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) { rafRef.current = requestAnimationFrame(scan); return }

      ctx.drawImage(video, 0, 0, w, h)

      const reticleZone: ReticleZone = { x: w / 2, y: h / 2, radius: RETICLE_RADIUS }

      if (mode === 'aruco') {
        // ArUco: 2 フレームに 1 回だけ実行（同期処理の負荷軽減）
        frameCount.current++
        if (frameCount.current % 2 === 0 && arucoRef.current) {
          const imageData = ctx.getImageData(0, 0, w, h)
          applyResult(detectAruco(arucoRef.current, imageData, reticleZone))
        }
      } else {
        // QR モード
        if (useBD && bdRef.current && !detectingRef.current) {
          // BarcodeDetector パス（非同期・高速）
          detectingRef.current = true
          bdRef.current.detect(canvas)
            .then((results) => {
              if (results.length === 0) { applyResult(null); return }
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
            .catch(() => applyResult(null))
            .finally(() => { detectingRef.current = false })
        } else if (!useBD) {
          // jsQR フォールバック（同期）
          const imageData = ctx.getImageData(0, 0, w, h)
          applyResult(scanFrame(imageData, reticleZone))
        }
      }

      rafRef.current = requestAnimationFrame(scan)
    }

    rafRef.current = requestAnimationFrame(scan)

    return () => {
      // モード切り替え・アンマウント時: 全リソースをクリーンアップ
      cancelAnimationFrame(rafRef.current)
      bdRef.current        = null
      arucoRef.current     = null
      detectingRef.current = false
      frameCount.current   = 0
      prevRef.current      = { qrCodeId: null, isInReticle: false }
      setDetectedQR(null)
    }
  }, [enabled, mode, videoRef, canvasRef])

  return { detectedQR }
}
