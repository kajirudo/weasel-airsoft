/**
 * geo — 共有 GPS ユーティリティ
 *
 * サーバー・クライアント両方から import できる（ディレクティブなし）。
 */

/** 2点間の地表距離（メートル） */
export function geoDistM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dlat = (a.lat - b.lat) * 111_320
  const dlng = (a.lng - b.lng) * 111_320 * Math.cos(a.lat * Math.PI / 180)
  return Math.sqrt(dlat ** 2 + dlng ** 2)
}

/** a → b の方位角（北=0、時計回り、0〜360°） */
export function bearingDeg(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLng = b.lng - a.lng
  const dLat = b.lat - a.lat
  const deg  = Math.atan2(dLng, dLat) * (180 / Math.PI)
  return (deg + 360) % 360
}

/** 角度差を -180〜+180 に正規化 */
export function normAngle(a: number): number {
  return ((a % 360) + 540) % 360 - 180
}
