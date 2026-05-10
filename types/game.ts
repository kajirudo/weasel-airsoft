import type { QrCodeId } from './database'

export interface DetectedQR {
  qrCodeId: QrCodeId
  centroidX: number
  centroidY: number
  isInReticle: boolean
}

export interface ReticleZone {
  x: number
  y: number
  radius: number
}

export interface LocalPlayerSession {
  deviceId: string
  playerId: string
  gameId: string
  qrCodeId: QrCodeId
  name: string
}
