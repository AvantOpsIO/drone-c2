/**
 * Imperative FLIR/EO canvas renderer — Tier A data path.
 *
 * WHY procedural noise terrain: Real FLIR feeds show organic thermal variation
 * across terrain — warm roads, cool water, mixed vegetation. Flat ellipses
 * look like a PowerPoint slide. Value noise with multiple octaves produces
 * believable thermal texture that scrolls with drone movement, giving the
 * impression of a real gimbal-stabilized sensor looking at the ground.
 */

import { SAB_OFFSETS, SAB_DRONE_STRIDE, DRONE_COUNT, COLORS, DRONE_CALLSIGNS, DRONE_IDS } from '../constants/tactical'
import { FLIGHT_MODE_LABELS, type BoundingBox } from '../types/telemetry'

let frameCounter = 0

const lastSabWarn: Record<string, number> = {}
function warnSabCorrupt(renderer: string, droneIdx: number, lat: number, lon: number) {
  const key = `${renderer}-${droneIdx}`
  const now = performance.now()
  if (now - (lastSabWarn[key] ?? 0) < 5000) return
  lastSabWarn[key] = now
  console.warn(`[${renderer}] SAB corrupt data drone=${droneIdx} lat=${lat} lon=${lon}`)
}

// Pre-computed permutation table for value noise.
const PERM = new Uint8Array(512)
;(() => {
  const p = new Uint8Array(256)
  for (let i = 0; i < 256; i++) p[i] = i
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[p[i], p[j]] = [p[j], p[i]]
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255]
})()

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10)
}

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a)
}

function grad(hash: number, x: number, y: number): number {
  const h = hash & 3
  const u = h < 2 ? x : y
  const v = h < 2 ? y : x
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v)
}

/** 2D Perlin-style value noise, returns -1 to 1. */
function noise2d(x: number, y: number): number {
  const xi = Math.floor(x) & 255
  const yi = Math.floor(y) & 255
  const xf = x - Math.floor(x)
  const yf = y - Math.floor(y)
  const u = fade(xf)
  const v = fade(yf)

  const aa = PERM[PERM[xi] + yi]
  const ab = PERM[PERM[xi] + yi + 1]
  const ba = PERM[PERM[xi + 1] + yi]
  const bb = PERM[PERM[xi + 1] + yi + 1]

  return lerp(
    lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u),
    lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u),
    v,
  )
}

/** Fractal Brownian motion — layered noise for realistic terrain. */
function fbm(x: number, y: number, octaves: number): number {
  let value = 0
  let amplitude = 0.5
  let frequency = 1
  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise2d(x * frequency, y * frequency)
    amplitude *= 0.5
    frequency *= 2
  }
  return value
}

// Off-screen buffer for the thermal terrain — avoids per-pixel getImageData.
let terrainBuffer: ImageData | null = null
let lastTerrainW = 0
let lastTerrainH = 0

/** Read a Float64 from the SAB. */
function readF64(view: Float64Array, droneByteOffset: number, fieldOffset: number): number {
  return view[(droneByteOffset + fieldOffset) / 8]
}

/** Read an Int32 from the SAB. */
function readI32(view: Int32Array, droneByteOffset: number, fieldOffset: number): number {
  return Atomics.load(view, (droneByteOffset + fieldOffset) / 4)
}

export function renderFlir(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  float64View: Float64Array | null,
  int32View: Int32Array | null,
  selectedDroneIdx: number,
  boundingBoxes: BoundingBox[],
) {
  frameCounter++

  // Read selected drone from SAB.
  let lat = 0, lon = 0, altMSL = 0, altAGL = 0, gndSpd = 0, vertSpd = 0
  let heading = 0, armed = 0, modeCode = 0, timestamp = 0

  if (float64View && int32View && selectedDroneIdx >= 0) {
    const off = selectedDroneIdx * SAB_DRONE_STRIDE
    lat = readF64(float64View, off, SAB_OFFSETS.lat)
    lon = readF64(float64View, off, SAB_OFFSETS.lon)

    if (!isFinite(lat) || !isFinite(lon)) {
      warnSabCorrupt('flir', selectedDroneIdx, lat, lon)
      lat = 0; lon = 0
    }

    altMSL = readF64(float64View, off, SAB_OFFSETS.altitudeMSL)
    altAGL = readF64(float64View, off, SAB_OFFSETS.altitudeAGL)
    gndSpd = readF64(float64View, off, SAB_OFFSETS.groundSpeed)
    vertSpd = readF64(float64View, off, SAB_OFFSETS.verticalSpeed)
    heading = readF64(float64View, off, SAB_OFFSETS.heading)
    armed = readI32(int32View, off, SAB_OFFSETS.armed)
    modeCode = readI32(int32View, off, SAB_OFFSETS.flightModeCode)
    timestamp = readF64(float64View, off, SAB_OFFSETS.timestamp)
  }

  const droneId = selectedDroneIdx >= 0 ? DRONE_IDS[selectedDroneIdx] : null
  const callsign = droneId ? DRONE_CALLSIGNS[droneId] ?? droneId : '---'
  const flightMode = FLIGHT_MODE_LABELS[modeCode] ?? 'UNKNOWN'

  // --- Thermal terrain ---
  // WHY noise-based: Procedural noise with FBM produces organic thermal patterns
  // (warm roads, cool patches, mixed vegetation) that scroll with drone movement.
  // This is orders of magnitude more believable than flat ellipses.
  // We render at 1/4 resolution and scale up for performance.
  const scale = 4
  const tw = Math.ceil(width / scale)
  const th = Math.ceil(height / scale)

  if (!terrainBuffer || lastTerrainW !== tw || lastTerrainH !== th) {
    terrainBuffer = new ImageData(tw, th)
    lastTerrainW = tw
    lastTerrainH = th
  }

  const data = terrainBuffer.data
  // Scroll offset tied to drone lat/lon so terrain moves as drone flies.
  const ox = lon * 5000
  const oy = lat * 5000
  const noiseScale = 0.035
  const time = frameCounter * 0.002

  for (let py = 0; py < th; py++) {
    for (let px = 0; px < tw; px++) {
      const nx = (px + ox) * noiseScale
      const ny = (py - oy) * noiseScale

      // Base terrain: 4-octave FBM gives fractal detail.
      let v = fbm(nx, ny, 4)
      // Add slow-moving atmospheric shimmer.
      v += 0.08 * noise2d(nx * 0.5 + time, ny * 0.5)

      // Map from [-1,1] to thermal brightness [15, 65].
      // This range keeps it dark (FLIR white-hot mode, looking at cool terrain)
      // with warm features popping brighter.
      const brightness = Math.floor(40 + v * 35)
      const clamped = Math.max(8, Math.min(80, brightness))

      // Slight green tint for FLIR phosphor look.
      const idx = (py * tw + px) * 4
      data[idx] = clamped - 3
      data[idx + 1] = clamped + 4
      data[idx + 2] = clamped - 3
      data[idx + 3] = 255
    }
  }

  // Sensor noise: randomly brighten scattered pixels.
  const pixelCount = tw * th
  const noiseCount = Math.floor(pixelCount * 0.003)
  for (let i = 0; i < noiseCount; i++) {
    const idx = Math.floor(Math.random() * pixelCount) * 4
    const bump = 25 + Math.floor(Math.random() * 35)
    data[idx] = Math.min(255, data[idx] + bump)
    data[idx + 1] = Math.min(255, data[idx + 1] + bump)
    data[idx + 2] = Math.min(255, data[idx + 2] + bump)
  }

  // Draw terrain at reduced resolution, then scale up.
  const offCanvas = new OffscreenCanvas(tw, th)
  const offCtx = offCanvas.getContext('2d')!
  offCtx.putImageData(terrainBuffer, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(offCanvas, 0, 0, width, height)

  // --- Vignette: darken edges to simulate lens falloff ---
  const vGrad = ctx.createRadialGradient(
    width / 2, height / 2, Math.min(width, height) * 0.3,
    width / 2, height / 2, Math.max(width, height) * 0.7,
  )
  vGrad.addColorStop(0, 'rgba(0,0,0,0)')
  vGrad.addColorStop(1, 'rgba(0,0,0,0.5)')
  ctx.fillStyle = vGrad
  ctx.fillRect(0, 0, width, height)

  // --- Other drones in FOV as hot spots ---
  if (float64View && int32View && selectedDroneIdx >= 0) {
    for (let i = 0; i < DRONE_COUNT; i++) {
      if (i === selectedDroneIdx) continue
      const off = i * SAB_DRONE_STRIDE
      const oLat = readF64(float64View, off, SAB_OFFSETS.lat)
      const oLon = readF64(float64View, off, SAB_OFFSETS.lon)

      const dlat = (oLat - lat) * 111320
      const dlon = (oLon - lon) * 111320 * Math.cos(lat * Math.PI / 180)
      const dist = Math.sqrt(dlat * dlat + dlon * dlon)

      if (dist < 3000) {
        const px = width / 2 + (dlon / 3000) * (width / 2)
        const py = height / 2 - (dlat / 3000) * (height / 2)

        if (px > 0 && px < width && py > 0 && py < height) {
          // Hot spot glow
          const glow = ctx.createRadialGradient(px, py, 0, px, py, 12)
          glow.addColorStop(0, 'rgba(255,255,255,0.9)')
          glow.addColorStop(0.5, 'rgba(255,255,255,0.3)')
          glow.addColorStop(1, 'rgba(255,255,255,0)')
          ctx.fillStyle = glow
          ctx.fillRect(px - 12, py - 12, 24, 24)

          // Bright core
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(px - 2, py - 2, 5, 5)

          const otherId = DRONE_IDS[i]
          ctx.font = '10px monospace'
          ctx.fillStyle = COLORS.textPrimary
          ctx.fillText(DRONE_CALLSIGNS[otherId] ?? otherId, px + 8, py + 3)
        }
      }
    }
  }

  // --- AI bounding boxes ---
  for (const box of boundingBoxes) {
    const bx = box.x * width
    const by = box.y * height
    const bw = box.w * width
    const bh = box.h * height

    const boxColor = box.label === 'VEHICLE' ? COLORS.bbVehicle
      : box.label === 'PERSONNEL' ? COLORS.bbPersonnel
      : COLORS.bbUnknown

    ctx.strokeStyle = boxColor
    ctx.lineWidth = 2
    ctx.strokeRect(bx, by, bw, bh)

    ctx.font = '11px monospace'
    ctx.fillStyle = boxColor
    ctx.fillText(`${box.label} ${(box.confidence * 100).toFixed(0)}%`, bx, by - 4)
  }

  // --- Center reticle ---
  drawReticle(ctx, width / 2, height / 2)

  // --- HUD burn-in ---
  ctx.font = '13px monospace'

  // Top left
  ctx.fillStyle = COLORS.textPrimary
  ctx.fillText(callsign, 12, 24)
  ctx.fillStyle = armed ? COLORS.alertCritical : COLORS.textSecondary
  ctx.fillText(armed ? 'ARMED' : 'SAFE', 12, 40)
  ctx.fillStyle = COLORS.safe
  ctx.fillText(flightMode, 100, 24)

  // Top right
  ctx.textAlign = 'right'
  ctx.fillStyle = COLORS.textPrimary
  ctx.fillText(`ALT MSL ${altMSL.toFixed(0).padStart(5)}m`, width - 12, 24)
  ctx.fillText(`ALT AGL ${altAGL.toFixed(0).padStart(5)}m`, width - 12, 40)

  // Bottom left
  ctx.textAlign = 'left'
  ctx.fillText(`GND ${gndSpd.toFixed(1).padStart(6)} m/s`, 12, height - 44)
  const vertArrow = vertSpd >= 0 ? '\u2191' : '\u2193'
  ctx.fillText(`VRT ${vertArrow}${Math.abs(vertSpd).toFixed(1).padStart(5)} m/s`, 12, height - 28)
  ctx.fillText(`HDG ${heading.toFixed(0).padStart(5)}\u00B0`, 12, height - 12)

  // Bottom right
  ctx.textAlign = 'right'
  const ts = timestamp > 0 ? new Date(timestamp).toISOString().substring(11, 23) : '--:--:--.---'
  ctx.fillText(ts + 'Z', width - 12, height - 28)
  ctx.fillStyle = COLORS.textSecondary
  ctx.fillText(`F:${frameCounter.toString().padStart(6, '0')}`, width - 12, height - 12)

  // Bottom center
  ctx.textAlign = 'center'
  ctx.fillStyle = COLORS.textMuted
  ctx.fillText('EO/IR CH1', width / 2, height - 12)
  ctx.textAlign = 'left'

  // --- Scan lines ---
  ctx.fillStyle = 'rgba(0, 0, 0, 0.06)'
  for (let y = 0; y < height; y += 3) {
    ctx.fillRect(0, y, width, 1)
  }
}

function drawReticle(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.strokeStyle = COLORS.reticle
  ctx.lineWidth = 1.5

  // Outer circle
  ctx.beginPath()
  ctx.arc(cx, cy, 40, 0, Math.PI * 2)
  ctx.stroke()

  // Inner cross with gap
  const gap = 8
  const arm = 25
  ctx.beginPath()
  ctx.moveTo(cx - arm, cy); ctx.lineTo(cx - gap, cy)
  ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + arm, cy)
  ctx.moveTo(cx, cy - arm); ctx.lineTo(cx, cy - gap)
  ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + arm)
  ctx.stroke()

  // Range tick marks at cardinal points
  const markerLen = 6
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const x1 = cx + Math.cos(angle) * 40
    const y1 = cy + Math.sin(angle) * 40
    const x2 = cx + Math.cos(angle) * (40 + markerLen)
    const y2 = cy + Math.sin(angle) * (40 + markerLen)
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }

  // Inner diamond
  ctx.beginPath()
  ctx.moveTo(cx, cy - 4)
  ctx.lineTo(cx + 4, cy)
  ctx.lineTo(cx, cy + 4)
  ctx.lineTo(cx - 4, cy)
  ctx.closePath()
  ctx.stroke()
}
