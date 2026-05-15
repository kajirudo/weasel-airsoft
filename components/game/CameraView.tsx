'use client'

import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import { useCamera }              from '@/hooks/useCamera'
import { useScanner }             from '@/hooks/useScanner'
import { preloadArucoDetector }   from '@/lib/detector/arucoDetector'
import { Reticle }                from './Reticle'
import type { DetectedQR }        from '@/types/game'
import type { MarkerMode }        from '@/lib/game/constants'
import { RETICLE_RADIUS }         from '@/lib/game/constants'

interface CameraViewProps {
  onQRDetected: (qr: DetectedQR | null) => void
  onShoot:      () => void
  isInReticle:  boolean
  /** true のとき通信切断中を示す（バイブレーション無効 + レティクル変色） */
  offline?:    boolean
  /** 'qr'（デフォルト）または 'aruco' */
  markerMode?: MarkerMode
  /** レティクルとズームボタンを隠す（シューティングモード用） */
  hideReticle?: boolean
}

/** CameraView から親に公開するメソッド群 */
export interface CameraViewHandle {
  captureFrame(): HTMLCanvasElement | null
}

function vibrate(pattern: VibratePattern) {
  if ('vibrate' in navigator) navigator.vibrate(pattern)
}

/** 倍率プリセット（端末の max zoom でフィルタリングして表示） */
const ZOOM_PRESETS = [1, 2, 4] as const

export const CameraView = forwardRef<CameraViewHandle, CameraViewProps>(
  function CameraView({ onQRDetected, onShoot, isInReticle, offline = false, markerMode = 'qr', hideReticle = false }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const { videoRef, isReady, error, zoomInfo, setZoom } = useCamera()

    // ── ズーム連動 RETICLE_RADIUS ────────────────────────────────────────────
    // ハードウェアズームは視野角を狭めるが映像解像度は変わらない。
    // ズーム倍率が上がるほどマーカーが大きく映るため判定円を広げ、
    // スコープ越しの狙撃でも確実にヒット判定が入るようにする。
    // 例: 1× → radius=RETICLE_RADIUS, 2× → ×1.4, 4× → ×2.0
    const currentZoom     = zoomInfo?.current ?? 1
    const effectiveRadius = Math.round(RETICLE_RADIUS * Math.sqrt(currentZoom))

    const { detectedQR } = useScanner({ videoRef, canvasRef, enabled: isReady, mode: markerMode, reticleRadius: effectiveRadius })

    // ArUco モードなら js-aruco を先行ロード（初回スキャンの遅延を防ぐ）
    useEffect(() => {
      if (markerMode === 'aruco') preloadArucoDetector()
    }, [markerMode])

    // 親コンポーネントへ captureFrame を公開
    useImperativeHandle(ref, () => ({
      captureFrame() {
        const video = videoRef.current
        if (!video || video.readyState < 2) return null
        const snap = document.createElement('canvas')
        snap.width  = video.videoWidth  || 640
        snap.height = video.videoHeight || 480
        const ctx = snap.getContext('2d')
        if (!ctx) return null
        ctx.drawImage(video, 0, 0, snap.width, snap.height)
        return snap
      },
    }))

    useEffect(() => {
      onQRDetected(detectedQR)
    }, [detectedQR, onQRDetected])

    const handleTap = useCallback(() => {
      if (offline) { vibrate(200); return }
      vibrate(isInReticle ? [30, 40, 30] : 50)
      onShoot()
    }, [isInReticle, onShoot, offline])

    // 端末が対応している倍率プリセットだけ表示
    const availablePresets = zoomInfo
      ? ZOOM_PRESETS.filter((z) => z <= zoomInfo.max)
      : []

    if (error) {
      return (
        <div className="fixed inset-0 bg-black flex items-center justify-center">
          <p className="text-red-400 text-center px-8">{error}</p>
        </div>
      )
    }

    return (
      <div className="fixed inset-0 bg-black" onClick={handleTap}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* 非表示 canvas: スキャン用（映像ピクセル空間） */}
        <canvas ref={canvasRef} className="hidden" />

        {/* レティクル（ズーム倍率を渡してスコープ表示を切り替える） */}
        {!hideReticle && (
          <Reticle active={isInReticle} offline={offline} zoom={currentZoom} />
        )}

        {/* ズーム切り替えボタン（対応端末かつ2種類以上ある場合のみ表示） */}
        {!hideReticle && availablePresets.length >= 2 && (
          <div
            className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            {availablePresets.map((z) => {
              const isActive = Math.round(currentZoom) === z
              return (
                <button
                  key={z}
                  onClick={() => setZoom(z)}
                  className={[
                    'w-12 h-8 rounded-full text-xs font-bold transition-all select-none',
                    isActive
                      ? 'bg-white text-black scale-110 shadow-lg'
                      : 'bg-black/50 text-white border border-white/30 active:bg-black/80',
                  ].join(' ')}
                >
                  {z}×
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  },
)
