'use client'

import { arucoSVGtoDataURL } from '@/lib/aruco/generator'
import { ARUCO_MARKERS, QR_LABELS, QR_COLORS } from '@/lib/game/constants'
import type { QrCodeId } from '@/types/database'

const QR_IDS: QrCodeId[] = [
  'player_1', 'player_2', 'player_3',
  'player_4', 'player_5', 'player_6',
]

// ── 1プレイヤー分のカード ─────────────────────────────────────────────────────
function PlayerCard({
  index,
  isLast,
}: {
  index:  number
  isLast: boolean
}) {
  const marker  = ARUCO_MARKERS[index]
  const qrId    = QR_IDS[index]
  const label   = QR_LABELS[qrId]
  const color   = QR_COLORS[qrId]

  // SVG を data URL に変換（cellPx=60 → 6×60=360px 正方形）
  const imgSrc  = arucoSVGtoDataURL(marker.bytes[0], marker.bytes[1], 60)

  return (
    <div
      className={`player-card${isLast ? '' : ' page-break'}`}
      style={{ '--card-color': color } as React.CSSProperties}
    >
      {/* ── 上部カラーバナー ── */}
      <div className="banner">
        <span className="game-name">WEASEL AIRSOFT — ArUco MODE</span>
        <span className="label">{label}</span>
        <span className="marker-id">Marker ID: {marker.id}  ·  Dict: 4×4_50</span>
      </div>

      {/* ── ArUco マーカー ── */}
      <div className="qr-area">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imgSrc} alt={`ArUco ${label}`} className="qr-img" />
      </div>

      {/* ── フッター ── */}
      <div className="footer">
        <p className="id-text">ArUco 4×4_50 — ID {marker.id} — {qrId}</p>
        <p className="hint">このマーカーをベスト・背中など平らな場所に貼付してください（推奨サイズ 15cm×15cm 以上）</p>
      </div>
    </div>
  )
}

// ── ページコンポーネント ──────────────────────────────────────────────────────
export default function ArucoPage() {
  return (
    <>
      <style>{`
        /* ══════════════════════════════════════
           画面プレビュー
        ══════════════════════════════════════ */
        .cards-wrapper {
          background:     #030712;
          min-height:     100vh;
          padding:        0 16px 48px;
          display:        flex;
          flex-direction: column;
          gap:            40px;
          align-items:    center;
        }

        .player-card {
          --banner-bg:   var(--card-color, #6b7280);
          background:    white;
          border:        6px solid var(--card-color, #6b7280);
          border-radius: 20px;
          overflow:      hidden;
          display:       flex;
          flex-direction: column;
          box-shadow:    0 20px 60px rgba(0,0,0,0.4);
          width:         100%;
          max-width:     380px;
        }

        .banner {
          background:     var(--banner-bg);
          display:        flex;
          flex-direction: column;
          align-items:    center;
          justify-content: center;
          gap:            2px;
          padding:        12px 0 10px;
        }
        .game-name  { color: rgba(255,255,255,0.65); font-size: 0.55rem; font-weight: 700; letter-spacing: 0.2em; }
        .label      { color: white; font-weight: 900; font-size: 2rem; letter-spacing: 0.15em; line-height: 1; }
        .marker-id  { color: rgba(255,255,255,0.5);  font-size: 0.55rem; font-family: monospace; margin-top: 2px; }

        .qr-area {
          flex:            1;
          display:         flex;
          align-items:     center;
          justify-content: center;
          background:      white;
          padding:         20px;
        }
        .qr-img       { display: block; max-width: 100%; height: auto; image-rendering: pixelated; }
        .footer       { padding: 10px 16px 16px; text-align: center; background: white; border-top: 1px solid #f3f4f6; }
        .id-text      { font-family: monospace; font-size: 0.7rem; color: #9ca3af; }
        .hint         { font-size: 0.65rem; color: #d1d5db; margin-top: 4px; display: none; }

        /* ══════════════════════════════════════
           印刷スタイル
        ══════════════════════════════════════ */
        @media print {
          @page { size: A4 portrait; margin: 0; }

          .no-print { display: none !important; }

          .cards-wrapper {
            background: white;
            padding:    0;
            gap:        0;
            min-height: unset;
          }

          .player-card {
            width:         210mm;
            height:        297mm;
            max-width:     none;
            margin:        0;
            padding:       0;
            border:        none;
            border-radius: 0;
            box-shadow:    none;
          }
          .page-break { break-after: page; }

          .banner    { height: 36mm; padding: 0; gap: 1.5mm; }
          .game-name { font-size: 7pt; }
          .label     { font-size: 38pt; }
          .marker-id { font-size: 7pt; margin-top: 1mm; }

          .qr-area { flex: 1; padding: 4mm 15mm; }
          .qr-img  {
            width:           180mm !important;
            height:          180mm !important;
            max-width:       none !important;
            object-fit:      contain;
            image-rendering: pixelated;
          }

          .footer   {
            height:         28mm;
            display:        flex;
            flex-direction: column;
            align-items:    center;
            justify-content: center;
            padding:        0 12mm;
            border-top:     0.5mm solid #e5e7eb;
          }
          .id-text  { font-size: 8pt; color: #6b7280; }
          .hint     { display: block; font-size: 7.5pt; color: #9ca3af; margin-top: 2mm; }
        }
      `}</style>

      {/* ── 画面専用ヘッダー ── */}
      <div className="no-print" style={{ background: '#030712', padding: '32px 16px 0' }}>
        <div style={{ maxWidth: 440, margin: '0 auto', textAlign: 'center' }}>
          <h1 style={{ color: 'white', fontWeight: 900, fontSize: '1.5rem' }}>
            ArUco マーカー — 印刷用
          </h1>
          <p style={{ color: '#9ca3af', fontSize: '0.875rem', marginTop: 4 }}>
            屋外サバゲー用。各プレイヤー A4 用紙 1 枚（全{ARUCO_MARKERS.length}枚）
          </p>

          {/* ── モード切り替えタブ ── */}
          <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'center' }}>
            <a href="/qr" style={{
              background: '#1f2937', color: '#9ca3af', fontWeight: 500, fontSize: '0.8rem',
              padding: '6px 16px', borderRadius: 20, border: '1px solid #374151',
              textDecoration: 'none',
            }}>
              ← ▦ QRコード
            </a>
            <span style={{
              background: '#581c87', color: '#d8b4fe', fontWeight: 700, fontSize: '0.8rem',
              padding: '6px 16px', borderRadius: 20, border: '1px solid #7e22ce',
            }}>
              ◈ ArUco
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 12 }}>
            <button
              onClick={() => window.print()}
              style={{
                background: '#22c55e', color: 'white', fontWeight: 700,
                padding: '10px 24px', borderRadius: 12, border: 'none', cursor: 'pointer',
              }}
            >
              🖨️ 印刷する（{ARUCO_MARKERS.length}枚）
            </button>
            <a
              href="/lobby"
              style={{
                background: '#374151', color: 'white', fontWeight: 500,
                padding: '10px 24px', borderRadius: 12, textDecoration: 'none', display: 'inline-block',
              }}
            >
              ← ロビーへ
            </a>
          </div>

          {/* Quiet Zone 警告 */}
          <div style={{
            marginTop: 12, background: '#1c1917', border: '1px solid #78350f',
            borderRadius: 10, padding: '10px 14px',
            fontSize: '0.75rem', color: '#d97706', lineHeight: 1.6,
          }}>
            ⚠️ <strong>Quiet Zone（白余白）について</strong><br />
            ArUco マーカーは周囲に <strong>マーカー幅の 10% 以上の白余白</strong> が必要です。<br />
            印刷後、マーカーの周囲に最低 1.5cm 以上の白い領域を確保してください。
          </div>

          {/* 説明カード */}
          <div style={{
            marginTop: 20, background: '#111827', border: '1px solid #1f2937',
            borderRadius: 12, padding: '14px 16px', textAlign: 'left',
            fontSize: '0.8rem', color: '#9ca3af', lineHeight: 1.75,
          }}>
            <p style={{ color: 'white', fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.1em', marginBottom: 6 }}>
              ArUco モードの特徴
            </p>
            <p>• <strong style={{ color: 'white' }}>有効射程 〜12m</strong>（QRコードの約 2〜3 倍）</p>
            <p>• 4×4 の二値グリッドで斜め検出に強い</p>
            <p>• スナイパーズームとの組み合わせで戦術性UP</p>
            <p style={{ marginTop: 8, color: '#6b7280' }}>推奨: A4 余白なし等倍印刷。屋外では 15cm×15cm 以上推奨。</p>
          </div>

          <div style={{ marginTop: 12 }}>
            <a
              href="/qr"
              style={{ color: '#4b5563', fontSize: '0.75rem', textDecoration: 'underline' }}
            >
              QRコード印刷ページへ →
            </a>
          </div>
        </div>
      </div>

      {/* ── カード一覧（画面プレビュー / 印刷） ── */}
      <div className="cards-wrapper">
        {ARUCO_MARKERS.map((_, i) => (
          <PlayerCard
            key={i}
            index={i}
            isLast={i === ARUCO_MARKERS.length - 1}
          />
        ))}
      </div>
    </>
  )
}
