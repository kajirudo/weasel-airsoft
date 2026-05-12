'use client'

import { useRef, useCallback, useEffect } from 'react'

/**
 * Web Audio API によるゲームサウンド（音声ファイル不要・手続き的生成）
 *
 * AudioContext はユーザー操作後に初期化されるため、
 * 最初のタップ（射撃など）で自動的に起動する。
 */
export function useSound() {
  const ctxRef = useRef<AudioContext | null>(null)

  // ページ上の最初のユーザー操作で AudioContext を解除する
  useEffect(() => {
    function unlock() {
      if (ctxRef.current?.state === 'suspended') {
        ctxRef.current.resume()
      }
    }
    document.addEventListener('touchstart', unlock, { once: true, passive: true })
    document.addEventListener('click',      unlock, { once: true, passive: true })
    return () => {
      document.removeEventListener('touchstart', unlock)
      document.removeEventListener('click',      unlock)
    }
  }, [])

  function ctx(): AudioContext {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext()
    }
    return ctxRef.current
  }

  /** 発砲音：短いポップ */
  const playShot = useCallback(() => {
    try {
      const c = ctx()
      const osc  = c.createOscillator()
      const gain = c.createGain()
      osc.connect(gain)
      gain.connect(c.destination)
      osc.frequency.setValueAtTime(900, c.currentTime)
      osc.frequency.exponentialRampToValueAtTime(300, c.currentTime + 0.08)
      gain.gain.setValueAtTime(0.25, c.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.08)
      osc.start(c.currentTime)
      osc.stop(c.currentTime + 0.08)
    } catch { /* ブラウザが AudioContext を未サポートでも無視 */ }
  }, [])

  /** 被弾音：低い鈍い衝撃音 */
  const playHit = useCallback(() => {
    try {
      const c = ctx()
      const osc  = c.createOscillator()
      const gain = c.createGain()
      osc.type = 'sawtooth'
      osc.connect(gain)
      gain.connect(c.destination)
      osc.frequency.setValueAtTime(180, c.currentTime)
      osc.frequency.exponentialRampToValueAtTime(40, c.currentTime + 0.25)
      gain.gain.setValueAtTime(0.4, c.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.25)
      osc.start(c.currentTime)
      osc.stop(c.currentTime + 0.25)
    } catch { /* 無視 */ }
  }, [])

  /** キル音：短い上昇アルペジオ（C-E-G） */
  const playKill = useCallback(() => {
    try {
      const c = ctx()
      const notes = [523, 659, 784] // C5, E5, G5
      notes.forEach((freq, i) => {
        const osc  = c.createOscillator()
        const gain = c.createGain()
        osc.connect(gain)
        gain.connect(c.destination)
        osc.frequency.value = freq
        const t = c.currentTime + i * 0.1
        gain.gain.setValueAtTime(0.2, t)
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
        osc.start(t)
        osc.stop(t + 0.18)
      })
    } catch { /* 無視 */ }
  }, [])

  /** タイムアウト音：3連ビープ */
  const playTimeout = useCallback(() => {
    try {
      const c = ctx()
      for (let i = 0; i < 3; i++) {
        const osc  = c.createOscillator()
        const gain = c.createGain()
        osc.connect(gain)
        gain.connect(c.destination)
        osc.frequency.value = 880
        const t = c.currentTime + i * 0.28
        gain.gain.setValueAtTime(0.25, t)
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
        osc.start(t)
        osc.stop(t + 0.18)
      }
    } catch { /* 無視 */ }
  }, [])

  /** 発電機起動完了アラート：上昇→急降下の緊張感ある2音 */
  const playGeneratorAlert = useCallback(() => {
    try {
      const c = ctx()
      // ピーン↑ ドン↓ の2連音
      const times = [
        { freq: 1200, endFreq: 800,  gain: 0.3, dur: 0.12, t: 0 },
        { freq: 800,  endFreq: 200,  gain: 0.5, dur: 0.3,  t: 0.15 },
      ]
      for (const s of times) {
        const osc  = c.createOscillator()
        const gain = c.createGain()
        osc.connect(gain)
        gain.connect(c.destination)
        osc.frequency.setValueAtTime(s.freq, c.currentTime + s.t)
        osc.frequency.exponentialRampToValueAtTime(s.endFreq, c.currentTime + s.t + s.dur)
        gain.gain.setValueAtTime(s.gain, c.currentTime + s.t)
        gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + s.t + s.dur)
        osc.start(c.currentTime + s.t)
        osc.stop(c.currentTime + s.t + s.dur + 0.01)
      }
    } catch { /* 無視 */ }
  }, [])

  /** 拠点占領完了：ファンファーレ風の3連昇音 */
  const playCaptureDone = useCallback(() => {
    try {
      const c = ctx()
      const notes = [523, 659, 784, 1047] // C5, E5, G5, C6
      notes.forEach((freq, i) => {
        const osc  = c.createOscillator()
        const gain = c.createGain()
        osc.type = 'triangle'
        osc.connect(gain)
        gain.connect(c.destination)
        osc.frequency.value = freq
        const t = c.currentTime + i * 0.08
        gain.gain.setValueAtTime(0.25, t)
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2)
        osc.start(t)
        osc.stop(t + 0.2)
      })
    } catch { /* 無視 */ }
  }, [])

  /** ストームダメージ：低く重い連続ビープ */
  const playStormDamage = useCallback(() => {
    try {
      const c = ctx()
      const osc  = c.createOscillator()
      const gain = c.createGain()
      osc.type = 'square'
      osc.connect(gain)
      gain.connect(c.destination)
      osc.frequency.setValueAtTime(120, c.currentTime)
      osc.frequency.exponentialRampToValueAtTime(60, c.currentTime + 0.4)
      gain.gain.setValueAtTime(0.15, c.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.4)
      osc.start(c.currentTime)
      osc.stop(c.currentTime + 0.4)
    } catch { /* 無視 */ }
  }, [])

  return { playShot, playHit, playKill, playTimeout, playGeneratorAlert, playCaptureDone, playStormDamage }
}
