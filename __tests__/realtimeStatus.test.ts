import { toRealtimeStatus } from '@/hooks/realtimeStatus'

describe('toRealtimeStatus', () => {
  it('SUBSCRIBED → connected', () => {
    expect(toRealtimeStatus('SUBSCRIBED')).toBe('connected')
  })

  it('CHANNEL_ERROR → error', () => {
    expect(toRealtimeStatus('CHANNEL_ERROR')).toBe('error')
  })

  it('TIMED_OUT → reconnecting', () => {
    expect(toRealtimeStatus('TIMED_OUT')).toBe('reconnecting')
  })

  it('CLOSED → reconnecting', () => {
    expect(toRealtimeStatus('CLOSED')).toBe('reconnecting')
  })

  it('未知の状態 → connecting', () => {
    expect(toRealtimeStatus('UNKNOWN')).toBe('connecting')
    expect(toRealtimeStatus('')).toBe('connecting')
  })
})
