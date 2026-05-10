'use client'

import { useEffect, useRef, useState } from 'react'

interface ShareGameIdProps {
  gameId: string
}

export function ShareGameId({ gameId }: ShareGameIdProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [copied, setCopied] = useState(false)
  const [showQR, setShowQR] = useState(false)
  const [gameUrl, setGameUrl] = useState('')

  useEffect(() => {
    setGameUrl(`${window.location.origin}/game/${gameId}`)
  }, [gameId])

  useEffect(() => {
    if (!showQR || !gameUrl || !canvasRef.current) return
    import('qrcode').then((QRCode) => {
      if (canvasRef.current) {
        QRCode.toCanvas(canvasRef.current, gameUrl, {
          width: 200,
          margin: 1,
          color: { dark: '#000000', light: '#ffffff' },
        })
      }
    })
  }, [showQR, gameUrl])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(gameUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard API が使えない場合のフォールバック
      prompt('URLをコピーしてください', gameUrl)
    }
  }

  return (
    <div className="w-full bg-black/70 rounded-xl px-4 py-3 backdrop-blur-sm space-y-3">
      <p className="text-gray-400 text-xs text-center">ゲームID（仲間に共有）</p>
      <p className="text-green-400 font-mono text-xs text-center break-all select-all">{gameId}</p>

      <div className="flex gap-2">
        <button
          onClick={handleCopy}
          className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium py-2 rounded-lg transition-colors active:scale-95"
        >
          {copied ? 'コピー済み ✓' : 'URLをコピー'}
        </button>
        <button
          onClick={() => setShowQR((v) => !v)}
          className="bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors active:scale-95"
          aria-label="QRコードを表示"
        >
          QR
        </button>
      </div>

      {showQR && (
        <div className="flex justify-center pt-1">
          <div className="bg-white p-2 rounded-lg">
            <canvas ref={canvasRef} />
          </div>
        </div>
      )}
    </div>
  )
}
