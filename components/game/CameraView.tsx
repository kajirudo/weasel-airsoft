'use client'

import { useRef, useEffect, useCallback } from 'react'
import { useCamera } from '@/hooks/useCamera'
import { useQRScanner } from '@/hooks/useQRScanner'
import { Reticle } from './Reticle'
import type { DetectedQR } from '@/types/game'

interface CameraViewProps {
  onQRDetected: (qr: DetectedQR | null) => void
  onShoot: () => void
  isInReticle: boolean
  /** true のとき通信切断中を示す（バイブレーション無効 + レティクル変色） */
  offline?: boolean
}

function vibrate(pattern: VibratePattern) {
  if ('vibrate' in navigator) navigator.vibrate(pattern)
}

export function CameraView({ onQRDetected, onShoot, isInReticle, offline = false }: CameraViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { videoRef, isReady, error } = useCamera()
  const { detectedQR } = useQRScanner({ videoRef, canvasRef, enabled: isReady })

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
}
