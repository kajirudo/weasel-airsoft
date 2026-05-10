'use client'

import { useEffect, useRef } from 'react'
import { QR_CODE_IDS, QR_LABELS, QR_COLORS } from '@/lib/game/constants'
import type { QrCodeId } from '@/types/database'

// ── 1プレイヤー分のカード ─────────────────────────────────────────────────────
function PlayerCard({
  id,
  label,
  color,
  isLast,
}: {
  id: QrCodeId
  label: string
  color: string
  isLast: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    import('qrcode').then((QRCode) => {
      if (!canvasRef.current) return
      QRCode.toCanvas(canvasRef.current, id, {
        width:  540,   // 印刷時に A4 の約半幅（余白込み）相当、高解像度
        margin: 2,
        color:  { dark: '#000000', light: '#ffffff' },
      })
    })
  }, [id])

  return (
    <div
      className={`player-card ${isLast ? '' : 'page-break'}`}
      style={{ borderColor: color }}
    >
      {/* ── 上部カラーバナー ── */}
      <div className="banner" style={{ backgroundColor: color }}>
        <span className="label">{label}</span>
      </div>

      {/* ── QR コード（中央） ── */}
      <div className="qr-area">
        <canvas ref={canvasRef} className="qr-canvas" />
      </div>

      {/* ── フッター ── */}
      <div className="footer">
        <p className="id-text">{id}</p>
        <p className="brand">WEASEL AIRSOFT</p>
        <p className="hint">このQRコードをベスト・背中など平らな場所に貼付してください</p>
      </div>
    </div>
  )
}

// ── ページコンポーネント ──────────────────────────────────────────────────────
export default function QRPage() {
  return (
    <>
      <style>{`
        /* ════════ 印刷スタイル ════════ */
        @media print {
          @page {
            size: A4 portrait;
            margin: 0;          /* カードが margin を自前で持つ */
          }
          body { background: white !important; }

          /* 画面専用要素を非表示 */
          .no-print { display: none !important; }

          /* カード = 1ページ丸ごと */
          .player-card {
            width:    210mm;
            height:   297mm;
            margin:   0;
            padding:  0;
            border-radius: 0 !important;
            box-shadow: none !important;
          }
          .page-break { break-after: page; }

          /* バナー */
          .banner { height: 28mm; }
          .label  { font-size: 22pt; }

          /* QR エリア — 印刷では余白を大きく取り QR を最大化 */
          .qr-area  { padding: 12mm; }
          .qr-canvas {
            /* 印刷時は width を上書きして A4 余白内に収める */
            max-width:  160mm !important;
            max-height: 160mm !important;
            width: auto !important;
            height: auto !important;
          }

          /* フッター */
          .footer    { padding: 6mm 12mm 10mm; }
          .id-text   { font-size: 9pt; }
          .brand     { font-size: 10pt; }
          .hint      { font-size: 8pt; margin-top: 3mm; }
        }

        /* ════════ 画面プレビュースタイル ════════ */
        .player-card {
          background: white;
          border: 5px solid;
          border-radius: 16px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 60px rgba(0,0,0,0.4);
          width: 100%;
          max-width: 360px;
          margin: 0 auto;
        }

        .banner {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 64px;
        }
        .label {
          color: white;
          font-weight: 900;
          font-size: 1.5rem;
          letter-spacing: 0.2em;
        }

        .qr-area {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          background: white;
          padding: 24px;
        }
        .qr-canvas {
          display: block;
          max-width: 100%;
          height: auto;
        }

        .footer {
          padding: 12px 16px 16px;
          text-align: center;
          background: white;
        }
        .id-text {
          font-family: monospace;
          font-size: 0.75rem;
          color: #9ca3af;
        }
        .brand {
          font-size: 0.7rem;
          color: #d1d5db;
          letter-spacing: 0.15em;
          margin-top: 2px;
        }
        .hint {
          display: none;  /* 画面では非表示 */
        }
      `}</style>

      <div className="min-h-screen bg-gray-950 px-4 py-8">

        {/* ── ヘッダー（画面のみ） ── */}
        <div className="no-print text-center mb-10 max-w-md mx-auto">
          <h1 className="text-2xl font-black text-white">QRコード — 印刷用</h1>
          <p className="text-gray-400 mt-1 text-sm">
            印刷するとプレイヤーごとに A4 1枚で出力されます
          </p>

          <div className="flex justify-center gap-3 mt-4">
            <button
              onClick={() => window.print()}
              className="bg-green-500 hover:bg-green-400 text-white font-bold px-6 py-2 rounded-xl transition-colors"
            >
              印刷する（6枚）
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
            <p>• <strong className="text-white">推奨: A4 用紙に等倍（100%）で印刷</strong></p>
            <p>• 5m以上で使う場合はコンビニの拡大コピーで 25cm×25cm に</p>
            <p>• ラミネート加工で雨・汗・泥に強くなります</p>
            <p>• 各プレイヤーに 1 枚ずつ配布してください</p>
          </div>
        </div>

        {/* ── カード一覧（画面: 縦スクロール / 印刷: 1枚ごとに改ページ） ── */}
        <div className="flex flex-col gap-10 items-center no-print-gap">
          {QR_CODE_IDS.map((id, i) => (
            <PlayerCard
              key={id}
              id={id}
              label={QR_LABELS[id]}
              color={QR_COLORS[id]}
              isLast={i === QR_CODE_IDS.length - 1}
            />
          ))}
        </div>

      </div>
    </>
  )
}
