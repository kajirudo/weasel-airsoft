/**
 * geo — 共有 GPS ユーティリティ
 *
 * サーバー・クライアント両方から import できる（ディレクティブなし）。
 */

/** 緯度 lat における 1度あたりのメートル数（lat, lng） */
export function mPerDegree(lat: number): { lat: number; lng: number } {
  return {
    lat: 111_320,
    lng: 111_320 * Math.cos(lat * Math.PI / 180),
  }
}

/**
 * center から最大 radiusM の範囲に GPS 点をランダム散布する。
 * offsetFactor を指定すると中心からの最小距離比率を調整できる（0〜1、デフォルト 0）。
 */
export function randomGeoPoint(
  lat: number,
  lng: number,
  radiusM: number,
  offsetFactor = 0,
): { lat: number; lng: number } {
  const angle = Math.random() * 2 * Math.PI
  const r     = radiusM * (offsetFactor + Math.random() * (1 - offsetFactor))
  const { lat: mpLat, lng: mpLng } = mPerDegree(lat)
  return {
    lat: lat + (r * Math.cos(angle)) / mpLat,
    lng: lng + (r * Math.sin(angle)) / mpLng,
  }
}

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
