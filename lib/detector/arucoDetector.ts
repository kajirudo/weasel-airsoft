/**
 * ArUco マーカー検出ラッパー（js-aruco）
 *
 * js-aruco は同期 API なので requestAnimationFrame ループに直接組み込める。
 * Detector インスタンスは初回アクセス時に 1 度だけ生成してキャッシュする。
 */

import type { DetectedQR, ReticleZone } from '@/types/game'
import { ARUCO_ID_TO_QR }              from '@/lib/game/constants'
import { computeFromCorners }          from '@/lib/qr/detector'

let detectorInstance: import('js-aruco').AR.Detector | null = null
let loadPromise: Promise<void> | null = null

/**
 * js-aruco Detector のシングルトンを取得する（遅延ロード）。
 * 2回目以降の呼び出しは即座に返る。
 */
async function getDetector(): Promise<import('js-aruco').AR.Detector> {
  if (detectorInstance) return detectorInstance

  if (!loadPromise) {
    loadPromise = import('js-aruco').then(({ AR }) => {
      detectorInstance = new AR.Detector()
    })
  }

  await loadPromise
  return detectorInstance!
}

// 非同期初期化を事前に開始しておく（ゲーム画面の描画開始前にロードを済ませる）
export function preloadArucoDetector(): void {
  getDetector().catch(() => { /* 無視 */ })
}

/**
 * ImageData から ArUco マーカーを検出し、レティクル判定を含む DetectedQR を返す。
 * プレイヤー ID（0〜5）に対応しないマーカーは無視する。
 *
 * @param detector - getDetector() で取得した Detector インスタンス
 * @param imageData - canvas から取得した ImageData
 * @param reticleZone - レティクルの中心座標と半径
 */
export function detectAruco(
  detector:    import('js-aruco').AR.Detector,
  imageData:   ImageData,
  reticleZone: ReticleZone,
): DetectedQR | null {
  const markers = detector.detect(imageData)

  for (const marker of markers) {
    const qrCodeId = ARUCO_ID_TO_QR[marker.id]
    if (!qrCodeId) continue   // プレイヤー外の ID はスキップ

    return computeFromCorners(marker.corners, reticleZone, qrCodeId)
  }

  return null
}

export { getDetector }
