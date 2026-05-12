/**
 * ArUco 4x4_50 マーカーの SVG を生成する。
 *
 * ArUco マーカーの構造:
 *   - 外側 1 マス: 常に黒（境界）
 *   - 内側 4×4: データビット（1=白、0=黒）
 *   → 全体 6×6 グリッドを出力
 *
 * 印刷用ヒント: 白い余白（quiet zone）は印刷用紙の余白で代用するため SVG には含めない。
 */

/**
 * 2バイト（16ビット）から 4×4 のブール格子に変換する。
 * MSB = 左上セル(0,0)、LSB = 右下セル(3,3)（行優先）
 *
 * @returns true = 白セル、false = 黒セル
 */
function bytesToGrid(byte0: number, byte1: number): boolean[][] {
  const combined = (byte0 << 8) | byte1  // 16ビット整数
  const grid: boolean[][] = []

  for (let row = 0; row < 4; row++) {
    const rowArr: boolean[] = []
    for (let col = 0; col < 4; col++) {
      const bitPos = 15 - (row * 4 + col)   // MSB first
      rowArr.push(((combined >> bitPos) & 1) === 1)
    }
    grid.push(rowArr)
  }

  return grid
}

/**
 * ArUco マーカーの SVG 文字列を生成する。
 *
 * @param byte0   - 辞書データ 1 バイト目
 * @param byte1   - 辞書データ 2 バイト目
 * @param cellPx  - 1マスのピクセルサイズ（デフォルト 40px → 6×40=240px）
 */
export function generateArucoSVG(
  byte0:  number,
  byte1:  number,
  cellPx: number = 40,
): string {
  const CELLS = 6                      // 6×6 グリッド
  const size  = CELLS * cellPx

  const grid = bytesToGrid(byte0, byte1)
  const rects: string[] = []

  // 背景: 白
  rects.push(`<rect width="${size}" height="${size}" fill="white"/>`)

  for (let row = 0; row < CELLS; row++) {
    for (let col = 0; col < CELLS; col++) {
      const isBorder = row === 0 || row === CELLS - 1 || col === 0 || col === CELLS - 1

      const isBlack = isBorder
        ? true                                 // 境界 = 常に黒
        : !grid[row - 1][col - 1]             // データ: false → 黒

      if (isBlack) {
        rects.push(
          `<rect x="${col * cellPx}" y="${row * cellPx}" width="${cellPx}" height="${cellPx}" fill="black"/>`
        )
      }
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg"` +
    ` width="${size}" height="${size}"` +
    ` viewBox="0 0 ${size} ${size}">` +
    rects.join('') +
    `</svg>`
  )
}

/**
 * SVG 文字列を `data:image/svg+xml` の URL に変換する。
 * <img src={...}> に使えるため印刷互換性が高い。
 */
export function arucoSVGtoDataURL(byte0: number, byte1: number, cellPx?: number): string {
  const svg = generateArucoSVG(byte0, byte1, cellPx)
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
