/**
 * Imperative FLIR/EO canvas renderer — Tier A data path.
 *
 * Friendly tracks are drawn from server-authored synthetic EO contacts in the SAB
 * (normalized 0–1); no client-side map projection for those dots.
 *
 * WHY procedural noise terrain: Real FLIR feeds show organic thermal variation
 * across terrain — warm roads, cool water, mixed vegetation. Flat ellipses
 * look like a PowerPoint slide. Value noise with multiple octaves produces
 * believable thermal texture that scrolls with drone movement, giving the
 * impression of a real gimbal-stabilized sensor looking at the ground.
 */

import {
  SAB_OFFSETS,
  SAB_DRONE_STRIDE,
  SAB_EO_BASE_BYTE,
  SAB_EO_SLOT_BYTES,
  SAB_EO_SLOT_COUNT,
  DRONE_IDS,
  COLORS,
  DRONE_CALLSIGNS,
} from '../constants/tactical'
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

/** Presentation-only smoothing (Tier A): damps telemetry step noise so FLIR terrain + EO dots do not micro-shake at rAF cadence. */
let flirSmoothDroneIdx = -1
let smoothLat = 0
let smoothLon = 0
const smoothEOX = [0.5, 0.5, 0.5, 0.5]
const smoothEOY = [0.5, 0.5, 0.5, 0.5]
const smoothDMSL = [0, 0, 0, 0]
const smoothSLR = [0, 0, 0, 0]

const FLIR_TERRAIN_SMOOTH = 0.14
const FLIR_EO_SMOOTH = 0.22

function resetFlirSmoothing(lat: number, lon: number) {
  smoothLat = lat
  smoothLon = lon
  for (let s = 0; s < SAB_EO_SLOT_COUNT; s++) {
    smoothEOX[s] = 0.5
    smoothEOY[s] = 0.5
    smoothDMSL[s] = 0
    smoothSLR[s] = 0
  }
}

function formatDeltaMsl(m: number): string {
  const r = Math.round(m)
  const sign = r > 0 ? '+' : ''
  return `\u0394MSL ${sign}${r}m`
}

function formatSlantRange(m: number): string {
  if (!Number.isFinite(m) || m <= 0) return 'SLR --'
  if (m >= 1000) return `SLR ${(m / 1000).toFixed(1)}km`
  return `SLR ${Math.round(m)}m`
}

/** High-contrast label chip: readable on mottled thermal without heavy strokeText. */
function drawFlirContactLabels(
  ctx: CanvasRenderingContext2D,
  lx: number,
  y0: number,
  callsign: string,
  line1: string,
  line2: string,
) {
  const fontCs = '600 12px monospace'
  const fontMeta = '10px monospace'
  const padX = 7
  const padY = 6
  const leadCs = 16
  const leadMeta = 14

  ctx.save()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  ctx.font = fontCs
  const w0 = ctx.measureText(callsign).width
  ctx.font = fontMeta
  const w1 = ctx.measureText(line1).width
  const w2 = ctx.measureText(line2).width
  const innerW = Math.max(w0, w1, w2)
  const boxW = innerW + padX * 2
  const y1 = y0 + leadCs
  const y2 = y1 + leadMeta
  const boxTop = y0 - 11
  const boxBottom = y2 + 5
  const boxH = boxBottom - boxTop + padY * 2
  const boxX = lx - padX
  const boxY = boxTop - padY

  ctx.beginPath()
  ctx.roundRect(boxX, boxY, boxW, boxH, 6)
  ctx.fillStyle = 'rgba(6, 12, 10, 0.9)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)'
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.fillStyle = '#f2faf4'
  ctx.font = fontCs
  ctx.fillText(callsign, lx, y0)
  ctx.fillStyle = '#dce8de'
  ctx.font = fontMeta
  ctx.fillText(line1, lx, y1)
  ctx.fillText(line2, lx, y2)
  ctx.restore()
}

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
  } else {
    flirSmoothDroneIdx = -1
  }

  let terrainLat = lat
  let terrainLon = lon
  if (
    float64View && int32View && selectedDroneIdx >= 0
    && isFinite(lat) && isFinite(lon) && (lat !== 0 || lon !== 0)
  ) {
    if (selectedDroneIdx !== flirSmoothDroneIdx) {
      flirSmoothDroneIdx = selectedDroneIdx
      resetFlirSmoothing(lat, lon)
    }
    smoothLat += (lat - smoothLat) * FLIR_TERRAIN_SMOOTH
    smoothLon += (lon - smoothLon) * FLIR_TERRAIN_SMOOTH
    terrainLat = smoothLat
    terrainLon = smoothLon
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
  // Scroll offset tied to smoothed lat/lon so thermal does not jitter with every telemetry tick.
  const ox = terrainLon * 5000
  const oy = terrainLat * 5000
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

  // --- Other drones: Tier A reads synthetic EO contacts from SAB (server-authored). ---
  if (float64View && selectedDroneIdx >= 0) {
    const off = selectedDroneIdx * SAB_DRONE_STRIDE
    const others = DRONE_IDS.filter((_, i) => i !== selectedDroneIdx)

    // Pass 1: smooth all slots (canvas draw order does not affect state).
    type DrawSlot = { slot: number; slr: number; px: number; py: number }
    const toDraw: DrawSlot[] = []
    for (let s = 0; s < SAB_EO_SLOT_COUNT; s++) {
      const eoByte = SAB_EO_BASE_BYTE + s * SAB_EO_SLOT_BYTES
      const vis = readF64(float64View, off, eoByte + 16)
      if (vis < 0.5) {
        smoothEOX[s] += (0.5 - smoothEOX[s]) * 0.12
        smoothEOY[s] += (0.5 - smoothEOY[s]) * 0.12
        smoothDMSL[s] += (0 - smoothDMSL[s]) * 0.12
        smoothSLR[s] += (0 - smoothSLR[s]) * 0.12
        continue
      }
      const nx = readF64(float64View, off, eoByte)
      const ny = readF64(float64View, off, eoByte + 8)
      const dMsl = readF64(float64View, off, eoByte + 24)
      const slr = readF64(float64View, off, eoByte + 32)
      smoothEOX[s] += (nx - smoothEOX[s]) * FLIR_EO_SMOOTH
      smoothEOY[s] += (ny - smoothEOY[s]) * FLIR_EO_SMOOTH
      smoothDMSL[s] += (dMsl - smoothDMSL[s]) * FLIR_EO_SMOOTH
      smoothSLR[s] += (slr - smoothSLR[s]) * FLIR_EO_SMOOTH
      const px = smoothEOX[s] * width
      const py = smoothEOY[s] * height
      if (px > 0 && px < width && py > 0 && py < height) {
        toDraw.push({ slot: s, slr, px, py })
      }
    }

    // Pass 2: farther contacts first so nearer SLR paints on top (2D canvas has no z-buffer).
    toDraw.sort((a, b) => b.slr - a.slr || a.slot - b.slot)

    for (const { slot: s, px, py } of toDraw) {
      const glow = ctx.createRadialGradient(px, py, 0, px, py, 12)
      glow.addColorStop(0, 'rgba(255,255,255,0.9)')
      glow.addColorStop(0.5, 'rgba(255,255,255,0.3)')
      glow.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = glow
      ctx.fillRect(px - 12, py - 12, 24, 24)

      ctx.fillStyle = '#ffffff'
      ctx.fillRect(px - 2, py - 2, 5, 5)

      const otherId = others[s]!
      const lx = px + 10
      const y0 = py + 4
      const cs = DRONE_CALLSIGNS[otherId] ?? otherId
      drawFlirContactLabels(
        ctx,
        lx,
        y0,
        cs,
        formatDeltaMsl(smoothDMSL[s]),
        formatSlantRange(smoothSLR[s]),
      )
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
