'use client'

import { useEffect, useRef, useState } from 'react'

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stream: MediaStream | null = null

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.onloadedmetadata = () => setIsReady(true)
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

  return { videoRef, isReady, error }
}
