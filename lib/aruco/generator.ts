/**
 * js-aruco 互換 ArUco マーカー生成
 *
 * ⚠️ js-aruco は OpenCV 4×4_50 辞書ではなく独自の Hamming 符号形式を使用する。
 *
 * ── マーカー構造 ──────────────────────────────────────────────────────────────
 *   7×7 セル（6×6 ではない）
 *   外周 1 セル幅: 黒ボーダー（必須）
 *   内側 5×5: Hamming 符号データ（1=白, 0=黒）
 *
 * ── Hamming 符号語 ────────────────────────────────────────────────────────────
 *   各行の 5 ビットは以下のいずれかでなければ認識されない:
 *     (bit[1], bit[3]) = (0,0) → row = [1, 0, 0, 0, 0]
 *     (bit[1], bit[3]) = (0,1) → row = [1, 0, 1, 1, 1]
 *     (bit[1], bit[3]) = (1,0) → row = [0, 1, 0, 0, 1]
 *     (bit[1], bit[3]) = (1,1) → row = [0, 1, 1, 1, 0]
 *
 * ── ID エンコーディング ───────────────────────────────────────────────────────
 *   ID は 10 ビット（0〜1023）
 *   bit9 = row0[1], bit8 = row0[3], ..., bit1 = row4[1], bit0 = row4[3]
 *   （js-aruco の mat2id 関数と同じ順序）
 */

// (b1, b3) ペアに対応する Hamming 符号語（index = b1<<1 | b3）
const CODEWORDS = [
  [1, 0, 0, 0, 0],  // (0,0)
  [1, 0, 1, 1, 1],  // (0,1)
  [0, 1, 0, 0, 1],  // (1,0)
  [0, 1, 1, 1, 0],  // (1,1)
] as const

/**
 * ArUco ID (0〜1023) から 5×5 データグリッドを生成する。
 * true = 白セル（1）, false = 黒セル（0）
 */
function idToGrid(id: number): boolean[][] {
  const grid: boolean[][] = []
  for (let i = 0; i < 5; i++) {
    const b1  = (id >> (9 - 2 * i)) & 1   // bits[i][1] → 上位データビット
    const b3  = (id >> (8 - 2 * i)) & 1   // bits[i][3] → 下位データビット
    const cw  = CODEWORDS[(b1 << 1) | b3]
    grid.push(Array.from(cw, b => b === 1))
  }
  return grid
}

/**
 * js-aruco 検出器が認識できる 7×7 ArUco マーカーの SVG を生成する。
 *
 * @param id     マーカー ID（0〜1023）
 * @param cellPx 1 セルのピクセルサイズ（デフォルト: 40px → 7×40=280px）
 */
export function generateArucoSVG(id: number, cellPx = 40): string {
  const CELLS = 7
  const size  = CELLS * cellPx
  const grid  = idToGrid(id)

  const rects: string[] = []

  for (let row = 0; row < CELLS; row++) {
    for (let col = 0; col < CELLS; col++) {
      const isBorder = row === 0 || row === 6 || col === 0 || col === 6
      const isBlack  = isBorder ? true : !grid[row - 1][col - 1]

      if (isBlack) {
        rects.push(
          `<rect x="${col * cellPx}" y="${row * cellPx}"` +
          ` width="${cellPx}" height="${cellPx}" fill="black"/>`,
        )
      }
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"` +
    ` viewBox="0 0 ${size} ${size}">` +
    `<rect width="${size}" height="${size}" fill="white"/>` +
    rects.join('') +
    `</svg>`
  )
}

/**
 * SVG を data:image/svg+xml URL に変換する（`<img src>` で使用可）。
 */
export function arucoSVGtoDataURL(id: number, cellPx = 40): string {
  return `data:image/svg+xml,${encodeURIComponent(generateArucoSVG(id, cellPx))}`
}
