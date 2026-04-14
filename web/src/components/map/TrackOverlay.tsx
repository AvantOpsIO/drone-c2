import { useEffect, useRef, useCallback } from 'react'
import L from 'leaflet'
import { useFrameLoop } from '../../hooks/useFrameLoop'
import { useTelemetryContext } from '../../hooks/useTelemetryWorker'
import { renderTracks } from '../../canvas/trackRenderer'
import { useUIStore, selectSelectedDroneId, selectWaypointLat, selectWaypointLon } from '../../store/uiStore'
import { useTelemetryStore } from '../../store/telemetryStore'
import { DRONE_IDS } from '../../constants/tactical'

/**
 * Canvas overlay for Leaflet that renders drone tracks at 60fps.
 *
 * WHY canvas overlay: DOM-based markers = N elements the browser must layout
 * and paint individually. Single canvas overlay = one composited pass.
 */
export function TrackOverlay({ map }: { map: L.Map | null }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const { float64View, int32View } = useTelemetryContext()

  const selectedIdxRef = useRef(-1)
  const waypointRef = useRef<{ lat: number; lon: number } | null>(null)
  const trailRef = useRef<Record<string, Array<{ lat: number; lon: number }>>>({})

  useEffect(() => {
    return useUIStore.subscribe(
      selectSelectedDroneId,
      (id) => { selectedIdxRef.current = id ? (DRONE_IDS as readonly string[]).indexOf(id) : -1 },
    )
  }, [])

  useEffect(() => {
    const update = () => {
      const lat = useUIStore.getState().waypointLat
      const lon = useUIStore.getState().waypointLon
      waypointRef.current = lat !== null && lon !== null ? { lat, lon } : null
    }
    update()
    const unsubLat = useUIStore.subscribe(selectWaypointLat, update)
    const unsubLon = useUIStore.subscribe(selectWaypointLon, update)
    return () => { unsubLat(); unsubLon() }
  }, [])

  useEffect(() => {
    return useTelemetryStore.subscribe(
      (state) => state.drones,
      (drones) => {
        const trails: Record<string, Array<{ lat: number; lon: number }>> = {}
        for (const id of DRONE_IDS) {
          trails[id] = drones[id]?.trail ?? []
        }
        trailRef.current = trails
      },
    )
  }, [])

  useEffect(() => {
    if (!map) return

    const pane = map.createPane('trackOverlay')
    pane.style.zIndex = '450'
    pane.style.pointerEvents = 'none'

    const canvas = document.createElement('canvas')
    canvas.style.position = 'absolute'
    canvas.style.top = '0'
    canvas.style.left = '0'
    canvas.style.pointerEvents = 'none'
    pane.appendChild(canvas)
    canvasRef.current = canvas

    const resize = () => {
      const size = map.getSize()
      canvas.width = size.x
      canvas.height = size.y
    }
    resize()
    map.on('resize', resize)

    const reposition = () => {
      const topLeft = map.containerPointToLayerPoint([0, 0])
      L.DomUtil.setPosition(canvas, topLeft)
    }
    map.on('move', reposition)
    map.on('zoom', reposition)
    reposition()

    return () => {
      map.off('resize', resize)
      map.off('move', reposition)
      map.off('zoom', reposition)
      pane.removeChild(canvas)
    }
  }, [map])

  const project = useCallback(
    (lat: number, lon: number) => {
      if (!map) return { x: 0, y: 0 }
      const point = map.latLngToContainerPoint([lat, lon])
      return { x: point.x, y: point.y }
    },
    [map],
  )

  useFrameLoop(() => {
    const canvas = canvasRef.current
    if (!canvas || !map) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    renderTracks(
      ctx,
      project,
      canvas.width,
      canvas.height,
      float64View,
      int32View,
      selectedIdxRef.current,
      waypointRef.current,
      trailRef.current,
    )
  })

  return null
}
