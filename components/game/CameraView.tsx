'use client'

import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import { useCamera }    from '@/hooks/useCamera'
import { useQRScanner } from '@/hooks/useQRScanner'
import { Reticle }      from './Reticle'
import type { DetectedQR } from '@/types/game'

interface CameraViewProps {
  onQRDetected: (qr: DetectedQR | null) => void
  onShoot:      () => void
  isInReticle:  boolean
  /** true のとき通信切断中を示す（バイブレーション無効 + レティクル変色） */
  offline?: boolean
}

/** CameraView から親に公開するメソッド群 */
export interface CameraViewHandle {
  /**
   * 現在のカメラフレームを新規 HTMLCanvasElement に描画して返す。
   * カメラが未準備の場合は null を返す。
   * 返り値の canvas は呼び出し元が自由に加工・toBlob できる。
   */
  captureFrame(): HTMLCanvasElement | null
}

function vibrate(pattern: VibratePattern) {
  if ('vibrate' in navigator) navigator.vibrate(pattern)
}

export const CameraView = forwardRef<CameraViewHandle, CameraViewProps>(
  function CameraView({ onQRDetected, onShoot, isInReticle, offline = false }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const { videoRef, isReady, error } = useCamera()
    const { detectedQR } = useQRScanner({ videoRef, canvasRef, enabled: isReady })

    // 親コンポーネントへ captureFrame を公開
    useImperativeHandle(ref, () => ({
      captureFrame() {
        const video = videoRef.current
        if (!video || video.readyState < 2) return null

        const snap   = document.createElement('canvas')
        snap.width   = video.videoWidth  || 640
        snap.height  = video.videoHeight || 480
        const ctx    = snap.getContext('2d')
        if (!ctx) return null
        ctx.drawImage(video, 0, 0, snap.width, snap.height)
        return snap
      },
    }))

    useEffect(() => {
      onQRDetected(detectedQR)
    }, [detectedQR, onQRDetected])

    const handleTap = useCallback(() => {
      if (offline) {
        // 通信切断中は「操作不可」のロングバズでフィードバック
        vibrate(200)
        return
      }
      // ヒット: パルス2回 / ミス: 単発
      vibrate(isInReticle ? [30, 40, 30] : 50)
      onShoot()
    }, [isInReticle, onShoot, offline])

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
        <canvas ref={canvasRef} className="hidden" />
        <Reticle active={isInReticle} offline={offline} />
      </div>
    )
  },
)
