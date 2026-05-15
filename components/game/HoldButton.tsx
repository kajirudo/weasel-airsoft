'use client'

import { useState, useEffect, useRef } from 'react'

export interface HoldButtonProps {
  label:          string
  holdMs:         number
  disabled?:      boolean
  pulsing?:       boolean
  bonusBadge?:    string
  onHoldStart:    () => void
  onHoldComplete: () => void
  onHoldCancel:   () => void
  color:          string
}

export function HoldButton({
  label, holdMs, disabled, pulsing, bonusBadge,
  onHoldStart, onHoldComplete, onHoldCancel,
  color,
}: HoldButtonProps) {
  const [progress,   setProgress]   = useState(0)
  const [holding,    setHolding]    = useState(false)
  const startRef     = useRef<number | null>(null)
  const rafRef       = useRef<number | null>(null)
  const completedRef = useRef(false)

  function startHold() {
    if (disabled || holding) return
    setHolding(true)
    completedRef.current = false
    startRef.current = Date.now()
    onHoldStart()

    function tick() {
      const elapsed = Date.now() - (startRef.current ?? Date.now())
      const p = Math.min(1, elapsed / holdMs)
      setProgress(p)
      if (p >= 1 && !completedRef.current) {
        completedRef.current = true
        onHoldComplete()
        setHolding(false)
        setProgress(0)
        return
      }
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  function cancelHold() {
    if (!holding) return
    setHolding(false)
    setProgress(0)
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    startRef.current = null
    if (!completedRef.current) onHoldCancel()
  }

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
  }, [])

  return (
    <button
      disabled={disabled}
      onPointerDown={startHold}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      className="relative overflow-hidden rounded-xl px-4 py-3 text-sm font-bold text-white select-none touch-none"
      style={{
        background: color,
        opacity: disabled ? 0.4 : 1,
        minWidth: '9rem',
        animation: pulsing && !holding ? 'cp-pulse 0.9s ease-in-out infinite alternate' : undefined,
      }}
    >
      <span
        className="pointer-events-none absolute inset-0 origin-left"
        style={{
          transform:  `scaleX(${progress})`,
          background: 'rgba(255,255,255,0.35)',
          transition: 'none',
        }}
      />
      {bonusBadge && !holding && (
        <span className="absolute -top-2 -right-1 rounded-full bg-yellow-400 text-black text-[10px] font-black px-1.5 py-0.5 leading-none z-10">
          {bonusBadge}
        </span>
      )}
      <span className="relative z-10">
        {holding ? `${Math.round(progress * 100)}%` : label}
      </span>
    </button>
  )
}
