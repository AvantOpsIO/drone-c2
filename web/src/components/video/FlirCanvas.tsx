import { useRef, useEffect } from 'react'
import { useFrameLoop } from '../../hooks/useFrameLoop'
import { useTelemetryContext } from '../../hooks/useTelemetryWorker'
import { renderFlir } from '../../canvas/flirRenderer'
import { useUIStore, selectSelectedDroneId } from '../../store/uiStore'
import { useTelemetryStore } from '../../store/telemetryStore'
import { DRONE_IDS } from '../../constants/tactical'
import type { BoundingBox } from '../../types/telemetry'

/**
 * FlirCanvas — the synthetic EO/IR camera view.
 *
 * Renders exactly once on mount. All visual updates are imperative in the
 * rAF callback via flirRenderer.ts, reading directly from SharedArrayBuffer.
 */
export function FlirCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { float64View, int32View } = useTelemetryContext()

  const selectedIdxRef = useRef(-1)
  const boxesRef = useRef<BoundingBox[]>([])

  // Track selected drone index via store subscription.
  useEffect(() => {
    const unsub = useUIStore.subscribe(
      selectSelectedDroneId,
      (id) => { selectedIdxRef.current = id ? (DRONE_IDS as readonly string[]).indexOf(id) : -1 },
    )
    return unsub
  }, [])

  // Update bounding boxes from Tier B when telemetry or selection changes.
  useEffect(() => {
    const unsub = useTelemetryStore.subscribe(
      (state) => {
        const id = useUIStore.getState().selectedDroneId
        return id ? state.drones[id]?.boundingBoxes ?? [] : []
      },
      (boxes) => { boxesRef.current = boxes },
    )
    return unsub
  }, [])

  useFrameLoop(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
      canvas.width = rect.width
      canvas.height = rect.height
    }

    renderFlir(
      ctx,
      canvas.width,
      canvas.height,
      float64View,
      int32View,
      selectedIdxRef.current,
      boxesRef.current,
    )
  })

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  )
}
