import { useEffect, useRef } from 'react'
import { FRAME_BUDGET_MS } from '../constants/tactical'

type FrameCallback = (time: number, dt: number) => void

const callbacks = new Set<FrameCallback>()
let rafId: number | null = null
let lastTime = 0

// Sampled frame budget tracking — warn at most once per window.
const SAMPLE_WINDOW_MS = 5000
let sampleStart = 0
let overBudgetCount = 0
let maxOverBudget = 0

function tick(time: number) {
  const dt = lastTime ? time - lastTime : 16.67
  lastTime = time

  const frameStart = performance.now()
  for (const cb of callbacks) {
    cb(time, dt)
  }
  const elapsed = performance.now() - frameStart

  if (elapsed > FRAME_BUDGET_MS) {
    overBudgetCount++
    if (elapsed > maxOverBudget) maxOverBudget = elapsed
  }

  if (frameStart - sampleStart >= SAMPLE_WINDOW_MS) {
    if (overBudgetCount > 0) {
      console.warn(
        `[frameLoop] ${overBudgetCount} frames over budget in ${(SAMPLE_WINDOW_MS / 1000).toFixed(0)}s` +
        ` (max=${maxOverBudget.toFixed(1)}ms, budget=${FRAME_BUDGET_MS}ms)`
      )
    }
    sampleStart = frameStart
    overBudgetCount = 0
    maxOverBudget = 0
  }

  if (callbacks.size > 0) {
    rafId = requestAnimationFrame(tick)
  } else {
    rafId = null
    lastTime = 0
  }
}

function registerCallback(cb: FrameCallback) {
  callbacks.add(cb)
  if (rafId === null) {
    sampleStart = performance.now()
    rafId = requestAnimationFrame(tick)
  }
}

function unregisterCallback(cb: FrameCallback) {
  callbacks.delete(cb)
}

export function useFrameLoop(callback: FrameCallback) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    const stableCb: FrameCallback = (t, dt) => callbackRef.current(t, dt)
    registerCallback(stableCb)
    return () => unregisterCallback(stableCb)
  }, [])
}
