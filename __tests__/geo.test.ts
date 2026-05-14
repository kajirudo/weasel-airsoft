import { geoDistM, bearingDeg, normAngle, randomGeoPoint, mPerDegree } from '@/lib/game/geo'

describe('geoDistM', () => {
  it('同一点は 0m', () => {
    expect(geoDistM({ lat: 35.0, lng: 135.0 }, { lat: 35.0, lng: 135.0 })).toBe(0)
  })

  it('約100m離れた点を正しく計算する', () => {
    const a = { lat: 35.0, lng: 135.0 }
    // 北へ約100m（1/111_320 度）
    const b = { lat: 35.0 + 100 / 111_320, lng: 135.0 }
    expect(geoDistM(a, b)).toBeCloseTo(100, 0)
  })

  it('同一緯度なら対称性を持つ', () => {
    const a = { lat: 35.0, lng: 139.7 }
    const b = { lat: 35.0, lng: 139.8 }
    expect(geoDistM(a, b)).toBeCloseTo(geoDistM(b, a), 5)
  })
})

describe('bearingDeg', () => {
  it('真北は 0°', () => {
    const a = { lat: 35.0, lng: 135.0 }
    const b = { lat: 35.1, lng: 135.0 }
    expect(bearingDeg(a, b)).toBeCloseTo(0, 0)
  })

  it('真東は 90°付近', () => {
    const a = { lat: 35.0, lng: 135.0 }
    const b = { lat: 35.0, lng: 135.1 }
    expect(bearingDeg(a, b)).toBeCloseTo(90, 0)
  })
})

describe('normAngle', () => {
  it('0〜180 は変化なし', () => {
    expect(normAngle(90)).toBe(90)
    expect(normAngle(180)).toBeCloseTo(-180, 5)
  })

  it('270° → -90°', () => {
    expect(normAngle(270)).toBeCloseTo(-90, 5)
  })
})

describe('mPerDegree', () => {
  it('緯度方向は常に 111_320m/deg', () => {
    expect(mPerDegree(35).lat).toBe(111_320)
    expect(mPerDegree(0).lat).toBe(111_320)
  })

  it('赤道では経度方向も 111_320m/deg', () => {
    expect(mPerDegree(0).lng).toBeCloseTo(111_320, 0)
  })

  it('高緯度では経度方向の m/deg が小さくなる', () => {
    expect(mPerDegree(60).lng).toBeLessThan(mPerDegree(0).lng)
  })
})

describe('randomGeoPoint', () => {
  it('中心から radiusM 以内に収まる', () => {
    const lat = 35.0, lng = 135.0, r = 100
    for (let i = 0; i < 50; i++) {
      const p = randomGeoPoint(lat, lng, r)
      expect(geoDistM({ lat, lng }, p)).toBeLessThanOrEqual(r + 1)
    }
  })

  it('offsetFactor を設定すると最小距離が確保される', () => {
    const lat = 35.0, lng = 135.0, r = 100, offset = 0.3
    for (let i = 0; i < 20; i++) {
      const p = randomGeoPoint(lat, lng, r, offset)
      expect(geoDistM({ lat, lng }, p)).toBeGreaterThanOrEqual(r * offset - 1)
    }
  })
})
