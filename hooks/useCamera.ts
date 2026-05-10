'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

/** 端末カメラが報告するズーム能力 */
export interface ZoomInfo {
  current: number
  min:     number
  max:     number
  step:    number
}

// Chrome/Android 非標準のズーム拡張型
interface ExtendedMediaTrackCapabilities extends MediaTrackCapabilities {
  zoom?: { min: number; max: number; step: number }
}
interface ExtendedMediaTrackConstraintSet extends MediaTrackConstraintSet {
  zoom?: number
}

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const trackRef = useRef<MediaStreamTrack | null>(null)
  const [isReady,  setIsReady]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [zoomInfo, setZoomInfo] = useState<ZoomInfo | null>(null)

  useEffect(() => {
    let stream: MediaStream | null = null

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width:  { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })

        const track = stream.getVideoTracks()[0]
        trackRef.current = track

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.onloadedmetadata = () => {
            setIsReady(true)

            // ズーム対応端末では getCapabilities() に zoom プロパティが存在する
            const caps = track.getCapabilities() as ExtendedMediaTrackCapabilities
            if (caps.zoom) {
              setZoomInfo({
                current: caps.zoom.min,   // 起動直後は最小倍率（≒1×）
                min:     caps.zoom.min,
                max:     caps.zoom.max,
                step:    caps.zoom.step,
              })
            }
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'NotAllowedError') {
          setError('カメラのアクセス許可が必要です')
        } else {
          setError('カメラの起動に失敗しました')
        }
      }
    }

    startCamera()

    return () => {
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  /**
   * カメラの光学ズームを変更する。
   * ズーム非対応端末ではノーオペレーション。
   */
  const setZoom = useCallback(async (zoom: number) => {
    const track = trackRef.current
    if (!track || !zoomInfo) return

    const clamped = Math.min(Math.max(zoom, zoomInfo.min), zoomInfo.max)

    try {
      await track.applyConstraints({
        advanced: [{ zoom: clamped } as ExtendedMediaTrackConstraintSet],
      })
      setZoomInfo((prev) => prev ? { ...prev, current: clamped } : prev)
    } catch {
      // applyConstraints 失敗は非致命的（非対応ブラウザでは無視）
    }
  }, [zoomInfo])

  return { videoRef, isReady, error, zoomInfo, setZoom }
}
