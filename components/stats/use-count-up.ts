'use client'

import { useEffect, useRef, useState } from 'react'

export function useCountUp(target: number, duration = 1100, decimals = 0) {
  const [current, setCurrent] = useState(0)
  const startRef = useRef<number | null>(null)

  useEffect(() => {
    if (target === 0) {
      setCurrent(0)
      return
    }
    startRef.current = null
    let rafId: number
    const precision = Math.max(0, Math.floor(decimals))
    const factor = Math.pow(10, precision)
    const tick = (now: number) => {
      if (startRef.current === null) startRef.current = now
      const elapsed = now - startRef.current
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setCurrent(Math.round(eased * target * factor) / factor)
      if (progress < 1) rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [target, duration, decimals])

  return current
}
