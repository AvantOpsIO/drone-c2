/**
 * Imperative track renderer for the Leaflet canvas overlay — Tier A data path.
 *
 * Reads all 5 drones from SharedArrayBuffer each frame and draws:
 * - Historical trail (fading opacity)
 * - Blue force icon with heading indicator
 * - 30-second predicted track (dashed), with dots at +10 / +20 / +30 s
 * - CPA warning indicators
 * - Waypoint marker and line
 *
 * WHY canvas overlay instead of Leaflet markers: Leaflet markers are DOM
 * elements. Moving 5 markers at 60fps = 300 layout/paint cycles per second.
 * A single canvas overlay redraws everything in one composited pass.
 */

import {
  SAB_OFFSETS,
  SAB_DRONE_STRIDE,
  DRONE_COUNT,
  COLORS,
  DRONE_CALLSIGNS,
  DRONE_IDS,
  CPA_WARNING_METERS,
  PREDICTION_SECONDS,
} from '../constants/tactical'

interface LatLng {
  lat: number
  lon: number
}

function deg2rad(d: number): number {
  return d * Math.PI / 180
}

function distanceMeters(a: LatLng, b: LatLng): number {
  const dlat = (b.lat - a.lat) * 111320
  const dlon = (b.lon - a.lon) * 111320 * Math.cos(deg2rad(a.lat))
  return Math.sqrt(dlat * dlat + dlon * dlon)
}

function predictPosition(
  lat: number, lon: number, heading: number, speed: number, seconds: number,
): LatLng {
  const dist = speed * seconds
  const dlat = dist * Math.cos(deg2rad(heading)) / 111320
  const dlon = dist * Math.sin(deg2rad(heading)) / (111320 * Math.cos(deg2rad(lat)))
  return { lat: lat + dlat, lon: lon + dlon }
}

const lastSabWarn: Record<string, number> = {}
function warnSabCorrupt(droneIdx: number, lat: number, lon: number) {
  const key = `track-${droneIdx}`
  const now = performance.now()
  if (now - (lastSabWarn[key] ?? 0) < 5000) return
  lastSabWarn[key] = now
  console.warn(`[trackRenderer] SAB corrupt data drone=${droneIdx} lat=${lat} lon=${lon}`)
}

function readF64(view: Float64Array, droneByteOffset: number, fieldOffset: number): number {
  return view[(droneByteOffset + fieldOffset) / 8]
}

export function renderTracks(
  ctx: CanvasRenderingContext2D,
  project: (lat: number, lon: number) => { x: number; y: number },
  width: number,
  height: number,
  float64View: Float64Array | null,
  int32View: Int32Array | null,
  selectedIdx: number,
  waypoint: { lat: number; lon: number } | null,
  trailData: Record<string, Array<{ lat: number; lon: number }>>,
) {
  ctx.clearRect(0, 0, width, height)
  if (!float64View || !int32View) return

  const positions: Array<{ lat: number; lon: number; heading: number; speed: number }> = []

  for (let i = 0; i < DRONE_COUNT; i++) {
    const off = i * SAB_DRONE_STRIDE
    let lat = readF64(float64View, off, SAB_OFFSETS.lat)
    let lon = readF64(float64View, off, SAB_OFFSETS.lon)
    const heading = readF64(float64View, off, SAB_OFFSETS.heading)
    const speed = readF64(float64View, off, SAB_OFFSETS.groundSpeed)

    if (!isFinite(lat) || !isFinite(lon)) {
      warnSabCorrupt(i, lat, lon)
      lat = 0; lon = 0
    }

    positions.push({ lat, lon, heading, speed })
  }

  const predictions: Array<Array<LatLng>> = positions.map(p => {
    const pts: LatLng[] = []
    for (let s = 10; s <= PREDICTION_SECONDS; s += 10) {
      pts.push(predictPosition(p.lat, p.lon, p.heading, p.speed, s))
    }
    return pts
  })

  for (let i = 0; i < DRONE_COUNT; i++) {
    const pos = positions[i]
    if (pos.lat === 0 && pos.lon === 0) continue

    const isSelected = i === selectedIdx
    const droneId = DRONE_IDS[i]
    const trail = trailData[droneId] ?? []

    // Historical trail
    if (trail.length > 1) {
      for (let j = 1; j < trail.length; j++) {
        const opacity = (j / trail.length) * 0.3
        const p1 = project(trail[j - 1].lat, trail[j - 1].lon)
        const p2 = project(trail[j].lat, trail[j].lon)
        ctx.strokeStyle = `rgba(74, 158, 255, ${opacity})`
        ctx.lineWidth = isSelected ? 2 : 1
        ctx.beginPath()
        ctx.moveTo(p1.x, p1.y)
        ctx.lineTo(p2.x, p2.y)
        ctx.stroke()
      }
    }

    // Predicted track
    const predPts = [pos, ...predictions[i].map(p => ({ ...p, heading: 0, speed: 0 }))]
    ctx.setLineDash([6, 4])
    ctx.strokeStyle = COLORS.blueForcePredicted
    ctx.lineWidth = isSelected ? 2 : 1
    ctx.beginPath()
    for (let j = 0; j < predPts.length; j++) {
      const p = project(predPts[j].lat, predPts[j].lon)
      if (j === 0) ctx.moveTo(p.x, p.y)
      else ctx.lineTo(p.x, p.y)
    }
    ctx.stroke()
    ctx.setLineDash([])

    // Time markers: one dot per prediction step (10 s, 20 s, 30 s ahead).
    for (let j = 0; j < predictions[i].length; j++) {
      const pp = project(predictions[i][j].lat, predictions[i][j].lon)
      ctx.fillStyle = COLORS.blueForcePredicted
      ctx.beginPath()
      ctx.arc(pp.x, pp.y, 3, 0, Math.PI * 2)
      ctx.fill()
    }

    // Blue force icon
    const cp = project(pos.lat, pos.lon)
    const radius = isSelected ? 10 : 7

    if (isSelected) {
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(cp.x, cp.y, radius + 3, 0, Math.PI * 2)
      ctx.stroke()
    }

    ctx.fillStyle = COLORS.blueForce
    ctx.beginPath()
    ctx.arc(cp.x, cp.y, radius, 0, Math.PI * 2)
    ctx.fill()

    // Heading indicator
    const hRad = deg2rad(pos.heading)
    ctx.strokeStyle = COLORS.blueForce
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(cp.x, cp.y)
    ctx.lineTo(cp.x + Math.sin(hRad) * (radius + 12), cp.y - Math.cos(hRad) * (radius + 12))
    ctx.stroke()

    // Callsign label (dark on light tiles; white stroke for dark map pockets)
    const label = DRONE_CALLSIGNS[droneId] ?? droneId
    const lx = cp.x + radius + 6
    const ly = cp.y + 4
    ctx.font = '11px monospace'
    ctx.lineJoin = 'round'
    ctx.miterLimit = 2
    ctx.lineWidth = isSelected ? 4 : 3
    ctx.strokeStyle = COLORS.mapTrackCallsignStroke
    ctx.strokeText(label, lx, ly)
    ctx.fillStyle = isSelected ? COLORS.mapTrackCallsignFillSelected : COLORS.mapTrackCallsignFill
    ctx.fillText(label, lx, ly)
  }

  // CPA warning
  for (let i = 0; i < DRONE_COUNT; i++) {
    for (let j = i + 1; j < DRONE_COUNT; j++) {
      for (let t = 0; t < predictions[i].length; t++) {
        const d = distanceMeters(predictions[i][t], predictions[j][t])
        if (d < CPA_WARNING_METERS) {
          const midLat = (predictions[i][t].lat + predictions[j][t].lat) / 2
          const midLon = (predictions[i][t].lon + predictions[j][t].lon) / 2
          const mp = project(midLat, midLon)

          ctx.strokeStyle = COLORS.geofence
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(mp.x, mp.y, 15, 0, Math.PI * 2)
          ctx.stroke()

          ctx.font = '10px monospace'
          ctx.fillStyle = COLORS.geofence
          ctx.fillText('CPA', mp.x - 10, mp.y - 18)
          break
        }
      }
    }
  }

  // Waypoint marker
  if (waypoint && selectedIdx >= 0) {
    const wp = project(waypoint.lat, waypoint.lon)
    const dp = project(positions[selectedIdx].lat, positions[selectedIdx].lon)

    ctx.setLineDash([4, 4])
    ctx.strokeStyle = COLORS.waypoint
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(dp.x, dp.y)
    ctx.lineTo(wp.x, wp.y)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.strokeStyle = COLORS.waypoint
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(wp.x, wp.y, 8, 0, Math.PI * 2)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(wp.x - 4, wp.y); ctx.lineTo(wp.x + 4, wp.y)
    ctx.moveTo(wp.x, wp.y - 4); ctx.lineTo(wp.x, wp.y + 4)
    ctx.stroke()
  }
}
