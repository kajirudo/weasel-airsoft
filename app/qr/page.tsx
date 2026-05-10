'use client'

import { useEffect, useRef } from 'react'
import { QR_CODE_IDS } from '@/lib/game/constants'
import type { QrCodeId } from '@/types/database'

const LABELS: Record<QrCodeId, string> = {
  player_1: 'プレイヤー 1',
  player_2: 'プレイヤー 2',
  player_3: 'プレイヤー 3',
  player_4: 'プレイヤー 4',
  player_5: 'プレイヤー 5',
}

function QRCodeCard({ value, label }: { value: string; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    import('qrcode').then((QRCode) => {
      if (canvasRef.current) {
        QRCode.toCanvas(canvasRef.current, value, {
          width: 240,
          margin: 2,
          color: { dark: '#000000', light: '#ffffff' },
        })
      }
    })
  }, [value])

  return (
    <div className="flex flex-col items-center gap-2 bg-white p-4 rounded-xl text-black print:break-inside-avoid">
      <canvas ref={canvasRef} />
      <p className="font-bold text-lg">{label}</p>
      <p className="font-mono text-xs text-gray-500">{value}</p>
    </div>
  )
}

export default function QRPage() {
  return (
    <div className="min-h-screen bg-gray-950 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-black text-white">QRコード — 印刷用</h1>
          <p className="text-gray-400 mt-1 text-sm">
            各QRコードを最小8cm×8cmで印刷して、プレイヤーに配布してください
          </p>
          <button
            onClick={() => window.print()}
            className="mt-4 bg-green-500 text-white font-bold px-6 py-2 rounded-xl hover:bg-green-400 print:hidden"
          >
            印刷する
          </button>
        </div>

        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
          {QR_CODE_IDS.map((id) => (
            <QRCodeCard key={id} value={id} label={LABELS[id]} />
          ))}
        </div>
      </div>
    </div>
  )
}
