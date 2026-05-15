'use client'

export type RealtimeStatus = 'connecting' | 'connected' | 'reconnecting' | 'error'

export function toRealtimeStatus(raw: string): RealtimeStatus {
  switch (raw) {
    case 'SUBSCRIBED':    return 'connected'
    case 'CHANNEL_ERROR': return 'error'
    case 'TIMED_OUT':
    case 'CLOSED':        return 'reconnecting'
    default:              return 'connecting'
  }
}
