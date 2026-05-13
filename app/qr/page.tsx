'use client'

import { useEffect, useState } from 'react'
import { QR_CODE_IDS, QR_LABELS, QR_COLORS, HUNTING_SEAL_COUNT } from '@/lib/game/constants'
import type { QrCodeId } from '@/types/database'

// 封印QRのID一覧（ハンティングモード用）
const SEAL_IDS = Array.from({ length: HUNTING_SEAL_COUNT }, (_, i) => `seal_${i + 1}`) as string[]

// ── 1プレイヤー分のカード ─────────────────────────────────────────────────────
function PlayerCard({
  id,
  label,
  color,
  isLast,
}: {
  id:     QrCodeId
  label:  string
  color:  string
  isLast: boolean
}) {
  const [src, setSrc] = useState('')

  // <canvas> より <img> の方が印刷互換性が高いため toDataURL を使用
  useEffect(() => {
    import('qrcode').then(({ toDataURL }) => {
      toDataURL(id, {
        width:  900,
        margin: 2,
        color:  { dark: '#000000', light: '#ffffff' },
      }).then(setSrc)
    })
  }, [id])

  return (
    <div
      className={`player-card${isLast ? '' : ' page-break'}`}
      style={{ '--card-color': color } as React.CSSProperties}
    >
      {/* ── 上部カラーバナー ── */}
      <div className="banner">
        <span className="game-name">WEASEL AIRSOFT</span>
        <span className="label">{label}</span>
      </div>

      {/* ── QR コード ── */}
      <div className="qr-area">
        {src
          ? <img src={src} alt={`QR ${label}`} className="qr-img" />
          : <div className="qr-placeholder" />
        }
      </div>

      {/* ── フッター ── */}
      <div className="footer">
        <p className="id-text">{id}</p>
        <p className="hint">このQRコードをベスト・背中など平らな場所に貼付してください</p>
      </div>
    </div>
  )
}

// ── 封印QR（ハンティングモード）カード ───────────────────────────────────────────
function SealCard({ sealId, index, isLast }: { sealId: string; index: number; isLast: boolean }) {
  const [src, setSrc] = useState('')

  useEffect(() => {
    import('qrcode').then(({ toDataURL }) => {
      toDataURL(sealId, {
        width:  900,
        margin: 2,
        color:  { dark: '#000000', light: '#ffffff' },
      }).then(setSrc)
    })
  }, [sealId])

  return (
    <div
      className={`player-card${isLast ? '' : ' page-break'}`}
      style={{ '--card-color': '#7c3aed' } as React.CSSProperties}
    >
      <div className="banner">
        <span className="game-name">WEASEL AIRSOFT — ハンティングモード</span>
        <span className="label">封印 {index}</span>
      </div>
      <div className="qr-area">
        {src
          ? <img src={src} alt={`封印QR ${index}`} className="qr-img" />
          : <div className="qr-placeholder" />
        }
      </div>
      <div className="footer">
        <p className="id-text">{sealId}</p>
        <p className="hint">フィールド内の地点に固定・設置してください（プレイヤーがスキャンで封印解除）</p>
      </div>
    </div>
  )
}

// ── ページコンポーネント ──────────────────────────────────────────────────────
export default function QRPage() {
  return (
    <>
      <style>{`
        /* ══════════════════════════════════════
           画面プレビュー
        ══════════════════════════════════════ */

        /* カード一覧ラッパー */
        .cards-wrapper {
          background: #030712;
          min-height: 100vh;
          padding: 0 16px 48px;
          display: flex;
          flex-direction: column;
          gap: 40px;
          align-items: center;
        }

        /* 個別カード */
        .player-card {
          --banner-bg: var(--card-color, #6b7280);
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
          background: var(--banner-bg);
          display:    flex;
          flex-direction: column;
          align-items:    center;
          justify-content: center;
          gap:     3px;
          padding: 14px 0 12px;
        }
        .game-name {
          color:          rgba(255,255,255,0.7);
          font-size:      0.6rem;
          font-weight:    700;
          letter-spacing: 0.25em;
        }
        .label {
          color:          white;
          font-weight:    900;
          font-size:      2rem;
          letter-spacing: 0.15em;
          line-height:    1;
        }

        .qr-area {
          flex:            1;
          display:         flex;
          align-items:     center;
          justify-content: center;
          background:      white;
          padding:         20px;
        }
        .qr-img {
          display:   block;
          max-width: 100%;
          height:    auto;
        }
        .qr-placeholder {
          width:         200px;
          height:        200px;
          background:    #f3f4f6;
          border-radius: 8px;
        }

        .footer {
          padding:    10px 16px 16px;
          text-align: center;
          background: white;
          border-top: 1px solid #f3f4f6;
        }
        .id-text { font-family: monospace; font-size: 0.7rem;  color: #9ca3af; }
        .hint    { font-size: 0.65rem; color: #d1d5db; margin-top: 4px; display: none; }

        /* ══════════════════════════════════════
           印刷スタイル
        ══════════════════════════════════════ */
        @media print {
          @page {
            size:   A4 portrait;
            margin: 0;    /* 余白はカード内 padding で管理 */
          }

          /* 画面専用要素を非表示 */
          .no-print { display: none !important; }

          /* ラッパー: 印刷では素通し */
          .cards-wrapper {
            background:    white;
            padding:       0;
            gap:           0;
            min-height:    unset;
          }

          /* カード = A4 1ページ丸ごと */
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
          /* 最後以外のカードの後に改ページ */
          .page-break { break-after: page; }

          /* バナー: 固定高さ */
          .banner  { height: 36mm; padding: 0; gap: 2mm; }
          .game-name { font-size: 8pt; }
          .label     { font-size: 38pt; }

          /* QR エリア: 残り高さを占有
             A4(297mm) - banner(36mm) - footer(28mm) = 233mm
             左右 padding 各 15mm → 有効幅 180mm
             QR は 180mm 正方形で中央配置 */
          .qr-area {
            flex:    1;
            padding: 4mm 15mm;
          }
          .qr-img {
            width:      180mm !important;
            height:     180mm !important;
            max-width:  none  !important;
            object-fit: contain;
          }
          .qr-placeholder {
            width:  180mm;
            height: 180mm;
          }

          /* フッター: 固定高さ */
          .footer {
            height:  28mm;
            display: flex;
            flex-direction: column;
            align-items:    center;
            justify-content: center;
            padding:    0 12mm;
            border-top: 0.5mm solid #e5e7eb;
          }
          .id-text { font-size: 8pt; color: #6b7280; }
          .hint    { display: block; font-size: 7.5pt; color: #9ca3af; margin-top: 2mm; }
        }
      `}</style>

      {/* ── 画面専用ヘッダー ── */}
      <div className="no-print" style={{ background: '#030712', padding: '32px 16px 0' }}>
        <div style={{ maxWidth: 440, margin: '0 auto', textAlign: 'center' }}>
          <h1 style={{ color: 'white', fontWeight: 900, fontSize: '1.5rem' }}>
            QRコード — 印刷用
          </h1>
          <p style={{ color: '#9ca3af', fontSize: '0.875rem', marginTop: 4 }}>
            プレイヤー {QR_CODE_IDS.length}枚 ＋ ハンティングモード封印QR {SEAL_IDS.length}枚
          </p>

          {/* ── モード切り替えタブ ── */}
          <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'center' }}>
            <span style={{
              background: '#166534', color: '#86efac', fontWeight: 700, fontSize: '0.8rem',
              padding: '6px 16px', borderRadius: 20, border: '1px solid #16a34a',
            }}>
              ▦ QRコード
            </span>
            <a href="/aruco" style={{
              background: '#1f2937', color: '#9ca3af', fontWeight: 500, fontSize: '0.8rem',
              padding: '6px 16px', borderRadius: 20, border: '1px solid #374151',
              textDecoration: 'none',
            }}>
              ◈ ArUco →
            </a>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 12 }}>
            <button
              onClick={() => window.print()}
              style={{
                background: '#22c55e', color: 'white', fontWeight: 700,
                padding: '10px 24px', borderRadius: 12, border: 'none', cursor: 'pointer',
              }}
            >
              🖨️ 印刷する（全{QR_CODE_IDS.length + SEAL_IDS.length}枚）
            </button>
            <a
              href="/lobby"
              style={{
                background: '#374151', color: 'white', fontWeight: 500,
                padding: '10px 24px', borderRadius: 12, textDecoration: 'none',
                display: 'inline-block',
              }}
            >
              ← ロビーへ
            </a>
          </div>

          <div style={{
            marginTop: 24, background: '#111827', border: '1px solid #1f2937',
            borderRadius: 12, padding: '12px 16px', textAlign: 'left',
            fontSize: '0.8rem', color: '#9ca3af', lineHeight: 1.7,
          }}>
            <p style={{ color: 'white', fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.1em', marginBottom: 6 }}>
              印刷のヒント
            </p>
            <p>• <strong style={{ color: 'white' }}>A4 用紙・等倍（100%）・余白なし</strong> で印刷</p>
            <p>• 5m以上で使う場合はコンビニの拡大コピーで 25cm×25cm 以上に</p>
            <p>• ラミネート加工すると雨・汗・泥に強くなります</p>
            <p>• 各プレイヤーに 1 枚ずつ配布してください</p>
            <p style={{ marginTop: 8, color: '#a78bfa', fontWeight: 700 }}>👹 ハンティングモード（封印QR）</p>
            <p>• 封印QR {SEAL_IDS.length}枚はフィールド内の各地点に固定設置</p>
            <p>• プレイヤーが近づいてスキャンすると封印解除（全解除でプレイヤー勝利）</p>
          </div>
        </div>
      </div>

      {/* ── カード一覧（画面: プレビュー / 印刷: A4×n ページ） ── */}
      <div className="cards-wrapper">
        {QR_CODE_IDS.map((id, i) => (
          <PlayerCard
            key={id}
            id={id}
            label={QR_LABELS[id]}
            color={QR_COLORS[id]}
            isLast={false}   // 封印QRが続くので常に改ページ
          />
        ))}

        {/* ── 封印QR（青鬼モード） ─────────────────────────────────── */}
        {/* 画面専用セクションヘッダー */}
        <div className="no-print" style={{
          width: '100%', maxWidth: 380, textAlign: 'center',
          padding: '8px 0 4px',
          borderTop: '2px solid #4c1d95',
        }}>
          <p style={{ color: '#a78bfa', fontWeight: 700, fontSize: '0.875rem' }}>
            👹 ハンティングモード — 封印QR
          </p>
          <p style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: 2 }}>
            フィールド内に設置する封印ポイント用QR
          </p>
        </div>

        {SEAL_IDS.map((sealId, i) => (
          <SealCard
            key={sealId}
            sealId={sealId}
            index={i + 1}
            isLast={i === SEAL_IDS.length - 1}
          />
        ))}
      </div>
    </>
  )
}
