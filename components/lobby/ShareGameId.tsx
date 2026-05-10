'use client'

import { useEffect, useRef, useState } from 'react'

interface ShareGameIdProps {
  gameId: string
  shortCode?: string | null
}

export function ShareGameId({ gameId, shortCode }: ShareGameIdProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [copied, setCopied] = useState(false)
  const [showQR, setShowQR] = useState(false)
  const [joinUrl, setJoinUrl] = useState('')

  useEffect(() => {
    const origin = window.location.origin
    // QR links to /join/[code] if short code is available, else /game/[uuid]
    setJoinUrl(shortCode
      ? `${origin}/join/${shortCode}`
      : `${origin}/game/${gameId}`
    )
  }, [gameId, shortCode])

  useEffect(() => {
    if (!showQR || !joinUrl || !canvasRef.current) return
    import('qrcode').then((QRCode) => {
      if (canvasRef.current) {
        QRCode.toCanvas(canvasRef.current, joinUrl, {
          width: 200,
          margin: 1,
          color: { dark: '#000000', light: '#ffffff' },
        })
      }
    })
  }, [showQR, joinUrl])

  async function handleCopy() {
    const text = shortCode ?? joinUrl
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      prompt('コードをコピーしてください', text)
    }
  }

  return (
    <div className="w-full bg-black/70 rounded-xl px-4 py-3 backdrop-blur-sm space-y-3">
      {shortCode ? (
        <>
          <p className="text-gray-400 text-xs text-center">ゲームコード（仲間に共有）</p>
          {/* Large, readable short code */}
          <p className="text-green-400 font-mono font-black text-4xl text-center tracking-[0.3em] select-all">
            {shortCode}
          </p>
          <p className="text-gray-600 text-xs text-center">
            /join/{shortCode.toLowerCase()} でも参加できます
          </p>
        </>
      ) : (
        <>
          <p className="text-gray-400 text-xs text-center">ゲームID（仲間に共有）</p>
          <p className="text-green-400 font-mono text-xs text-center break-all select-all">{gameId}</p>
        </>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleCopy}
          className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium py-2 rounded-lg transition-colors active:scale-95"
        >
          {copied ? 'コピー済み ✓' : shortCode ? 'コードをコピー' : 'URLをコピー'}
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
        <div className="flex flex-col items-center gap-2 pt-1">
          <div className="bg-white p-2 rounded-lg">
            <canvas ref={canvasRef} />
          </div>
          <p className="text-gray-600 text-xs">スキャンして即参加</p>
        </div>
      )}
    </div>
  )
}
