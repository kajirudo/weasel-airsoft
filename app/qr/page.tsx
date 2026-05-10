'use client'

import { useEffect, useRef } from 'react'
import { QR_CODE_IDS } from '@/lib/game/constants'
import type { QrCodeId } from '@/types/database'

const LABELS: Record<QrCodeId, string> = {
  player_1: 'PLAYER 1',
  player_2: 'PLAYER 2',
  player_3: 'PLAYER 3',
  player_4: 'PLAYER 4',
  player_5: 'PLAYER 5',
  player_6: 'PLAYER 6',
}

const COLORS: Record<QrCodeId, string> = {
  player_1: '#ef4444', // red
  player_2: '#3b82f6', // blue
  player_3: '#22c55e', // green
  player_4: '#f59e0b', // amber
  player_5: '#a855f7', // purple
  player_6: '#ec4899', // pink
}

function QRCodeCard({ value, label, color }: { value: string; label: string; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    import('qrcode').then((QRCode) => {
      if (canvasRef.current) {
        QRCode.toCanvas(canvasRef.current, value, {
          width: 400,
          margin: 2,
          color: { dark: '#000000', light: '#ffffff' },
        })
      }
    })
  }, [value])

  return (
    <div
      className="flex flex-col items-center bg-white rounded-2xl overflow-hidden print:break-inside-avoid print:rounded-none"
      style={{
        border: `4px solid ${color}`,
        // cut guides appear as a dashed outline offset in print
      }}
    >
      {/* Color banner */}
      <div className="w-full py-2 flex items-center justify-center" style={{ backgroundColor: color }}>
        <span className="text-white font-black text-lg tracking-widest">{label}</span>
      </div>

      {/* QR code */}
      <div className="p-4 bg-white">
        <canvas ref={canvasRef} />
      </div>

      {/* Footer */}
      <div className="w-full pb-3 text-center space-y-0.5">
        <p className="font-mono text-xs text-gray-400">{value}</p>
        <p className="text-gray-300 text-xs">WEASEL AIRSOFT</p>
      </div>
    </div>
  )
}

export default function QRPage() {
  return (
    <>
      {/* Print-only global styles */}
      <style>{`
        @media print {
          @page { size: A4; margin: 8mm; }
          body { background: white !important; }
          .no-print { display: none !important; }
          .print-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 8mm;
            page-break-inside: avoid;
          }
          .print-grid > * {
            break-inside: avoid;
          }
        }
      `}</style>

      <div className="min-h-screen bg-gray-950 px-4 py-8">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8 no-print">
            <h1 className="text-2xl font-black text-white">QRコード — 印刷用</h1>
            <p className="text-gray-400 mt-1 text-sm">
              各QRコードを最小 8cm×8cm で印刷してプレイヤーに配布してください
            </p>
            <div className="flex justify-center gap-3 mt-4">
              <button
                onClick={() => window.print()}
                className="bg-green-500 hover:bg-green-400 text-white font-bold px-6 py-2 rounded-xl transition-colors"
              >
                印刷する
              </button>
              <a
                href="/lobby"
                className="bg-gray-700 hover:bg-gray-600 text-white font-medium px-6 py-2 rounded-xl transition-colors"
              >
                ← ロビーへ
              </a>
            </div>

            <div className="mt-6 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-left text-sm text-gray-400 space-y-1">
              <p className="text-white font-semibold text-xs uppercase tracking-wider mb-2">印刷のヒント</p>
              <p>• <strong className="text-white">推奨サイズ: 25cm×25cm</strong>（5m以上の距離で確実に認識）</p>
              <p>• A4用紙2枚に分割して並べるか、コンビニの「拡大印刷」機能を使用</p>
              <p>• 最小でも 10cm×10cm（近距離戦のみ）</p>
              <p>• ラミネート加工で雨・汗・泥に強くなります</p>
              <p>• 各プレイヤーに1枚ずつ配布（色でも区別できます）</p>
              <p>• ベスト・ヘルメット・背中など平らな場所に貼付</p>
            </div>
          </div>

          {/* QR grid */}
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 print-grid">
            {QR_CODE_IDS.map((id) => (
              <QRCodeCard
                key={id}
                value={id}
                label={LABELS[id]}
                color={COLORS[id]}
              />
            ))}
          </div>

          <p className="text-center text-gray-700 text-xs mt-8 no-print">
            6種類のQRコード（player_1 〜 player_6）
          </p>
        </div>
      </div>
    </>
  )
}
