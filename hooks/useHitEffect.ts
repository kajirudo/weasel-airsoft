'use client'

import { useState, useCallback } from 'react'

export function useHitEffect() {
  const [isFlashing, setIsFlashing] = useState(false)

  const triggerFlash = useCallback(() => {
    setIsFlashing(true)
    setTimeout(() => setIsFlashing(false), 400)
  }, [])

  return { isFlashing, triggerFlash }
}
