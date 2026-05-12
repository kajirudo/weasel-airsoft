/**
 * 型宣言: js-aruco（TypeScript 型定義なし）
 * https://www.npmjs.com/package/js-aruco
 */
declare module 'js-aruco' {
  namespace AR {
    interface MarkerCorner {
      x: number
      y: number
    }

    interface Marker {
      /** ArUco 辞書内の ID（4x4_50: 0〜49） */
      id: number
      /** 4頂点の座標（画像ピクセル空間） */
      corners: MarkerCorner[]
    }

    class Detector {
      detect(imageData: ImageData): Marker[]
    }

    /** 辞書データ（マーカー生成に使用） */
    const DICTIONARIES: Record<
      string,
      { tau: number; codeList: number[][] }
    >
  }

  export { AR }
}
