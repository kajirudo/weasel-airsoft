'use client'

import { useState, useCallback } from 'react'

export type FlashColor = 'red' | 'blue'

export function useHitEffect() {
  const [isFlashing,  setIsFlashing]  = useState(false)
  const [flashColor,  setFlashColor]  = useState<FlashColor>('red')

  /** 被弾フラッシュ（赤） */
  const triggerFlash = useCallback(() => {
    setFlashColor('red')
    setIsFlashing(true)
    setTimeout(() => setIsFlashing(false), 400)
  }, [])

  /** ストームダメージフラッシュ（青） */
  const triggerStormFlash = useCallback(() => {
    setFlashColor('blue')
    setIsFlashing(true)
    setTimeout(() => setIsFlashing(false), 600)
  }, [])

  return { isFlashing, flashColor, triggerFlash, triggerStormFlash }
}
