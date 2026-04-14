/**
 * Telemetry Web Worker — Tier A data path.
 *
 * WHY this runs in a worker: The WebSocket receives ~50 messages/second (10Hz
 * per drone x 5 drones). Parsing JSON, validating sequences, and writing to
 * SharedArrayBuffer at that rate would consume main thread budget that we need
 * for 60fps canvas rendering. By running the socket entirely in a worker, the
 * main thread never sees raw telemetry — it only reads pre-written numbers
 * from the SAB during rAF, or receives 2Hz React-friendly summaries.
 */

import type { TelemetryMessage } from '../types/telemetry'

const SAB_DRONE_STRIDE = 112
const DRONE_IDS = ['drone-1', 'drone-2', 'drone-3', 'drone-4', 'drone-5']

const GPS_FIX_CODES: Record<string, number> = {
  NO_FIX: 0, '2D_FIX': 1, '3D_FIX': 2, RTK_FLOAT: 3, RTK_FIXED: 4,
}

const FLIGHT_MODE_CODES: Record<string, number> = {
  LOITER: 0, AUTO: 1, RTL: 2, GUIDED: 3, MANUAL: 4,
}

const BATTERY_CRITICAL = 20
const RSSI_CRITICAL = -80
const LINK_CRITICAL = 30
const STATS_INTERVAL_MS = 5000

let sab: SharedArrayBuffer | null = null
let float64View: Float64Array | null = null
let int32View: Int32Array | null = null

const lastSeq: Record<string, number> = {}
const lastMode: Record<string, string> = {}
const lastArmed: Record<string, boolean> = {}
const lastPostTime: Record<string, number> = {}

let ws: WebSocket | null = null
let reconnectAttempt = 0
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

// --- Throughput counters ---
let msgCount = 0
let parseErrors = 0
let sequenceGaps = 0
let lastStatsTime = performance.now()

function emitStats() {
  const now = performance.now()
  const elapsed = (now - lastStatsTime) / 1000
  const mps = elapsed > 0 ? msgCount / elapsed : 0

  self.postMessage({
    type: 'stats',
    messagesPerSecond: Math.round(mps * 10) / 10,
    parseErrors,
    sequenceGaps,
  })

  msgCount = 0
  parseErrors = 0
  sequenceGaps = 0
  lastStatsTime = now
}

function connect() {
  const protocol = self.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = `${protocol}//${self.location.host}/ws`

  console.info(`[telemetry-worker] connecting to ${url}`)
  ws = new WebSocket(url)

  ws.onopen = () => {
    reconnectAttempt = 0
    console.info('[telemetry-worker] connected')
    self.postMessage({ type: 'connection', state: 'connected' })
  }

  ws.onclose = (e) => {
    console.warn(`[telemetry-worker] disconnected code=${e.code} reason=${e.reason || 'none'}`)
    self.postMessage({ type: 'connection', state: 'reconnecting', attempt: reconnectAttempt })
    scheduleReconnect()
  }

  ws.onerror = (e) => {
    console.error('[telemetry-worker] ws error', e)
    ws?.close()
  }

  ws.onmessage = (event) => {
    handleMessage(event.data as string)
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return
  const base = Math.min(500 * Math.pow(2, reconnectAttempt), 30000)
  const jitter = base * (0.8 + Math.random() * 0.4)
  reconnectAttempt++
  console.info(`[telemetry-worker] reconnect attempt=${reconnectAttempt} delay=${Math.round(jitter)}ms`)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, jitter)
}

function handleMessage(raw: string) {
  let msg: TelemetryMessage
  try {
    msg = JSON.parse(raw)
  } catch {
    parseErrors++
    console.warn('[telemetry-worker] parse error', raw.substring(0, 200))
    return
  }

  msgCount++

  const droneIdx = DRONE_IDS.indexOf(msg.droneId)
  if (droneIdx === -1) return

  const prevSeq = lastSeq[msg.droneId] ?? 0
  if (prevSeq > 0) {
    if (msg.sequenceNum <= prevSeq) {
      console.warn(`[telemetry-worker] out-of-order: drone=${msg.droneId} got=${msg.sequenceNum} prev=${prevSeq}`)
    } else if (msg.sequenceNum > prevSeq + 1) {
      const gap = msg.sequenceNum - prevSeq - 1
      sequenceGaps += gap
      console.warn(`[telemetry-worker] gap: drone=${msg.droneId} missing=${gap} seq=${prevSeq + 1}..${msg.sequenceNum - 1}`)
    }
  }
  lastSeq[msg.droneId] = msg.sequenceNum

  writeSAB(droneIdx, msg)

  const now = performance.now()
  const lastPost = lastPostTime[msg.droneId] ?? 0
  const urgent = isUrgent(msg)

  if (urgent || now - lastPost >= 500) {
    lastPostTime[msg.droneId] = now
    self.postMessage({ type: 'telemetry', data: msg })
  }
}

function isUrgent(msg: TelemetryMessage): boolean {
  const id = msg.droneId
  if (lastMode[id] !== undefined && lastMode[id] !== msg.flightMode) {
    lastMode[id] = msg.flightMode
    return true
  }
  lastMode[id] = msg.flightMode

  if (lastArmed[id] !== undefined && lastArmed[id] !== msg.armed) {
    lastArmed[id] = msg.armed
    return true
  }
  lastArmed[id] = msg.armed

  if (msg.batteryPercent < BATTERY_CRITICAL) return true
  if (msg.rssi < RSSI_CRITICAL) return true
  if (msg.linkQuality < LINK_CRITICAL) return true

  return false
}

function writeSAB(droneIdx: number, msg: TelemetryMessage) {
  if (!float64View || !int32View) return

  const byteOffset = droneIdx * SAB_DRONE_STRIDE

  const f64Idx = byteOffset / 8
  float64View[f64Idx + 0] = msg.lat
  float64View[f64Idx + 1] = msg.lon
  float64View[f64Idx + 2] = msg.altitudeMSL
  float64View[f64Idx + 3] = msg.altitudeAGL
  float64View[f64Idx + 4] = msg.groundSpeed
  float64View[f64Idx + 5] = msg.verticalSpeed
  float64View[f64Idx + 6] = msg.heading
  float64View[f64Idx + 7] = msg.batteryPercent
  float64View[f64Idx + 10] = new Date(msg.timestamp).getTime()
  float64View[f64Idx + 11] = new Date(msg.receivedAt).getTime()

  const i32Base = byteOffset / 4
  Atomics.store(int32View, i32Base + 16, msg.rssi)
  Atomics.store(int32View, i32Base + 17, msg.linkQuality)
  Atomics.store(int32View, i32Base + 18, msg.satelliteCount)
  Atomics.store(int32View, i32Base + 19, msg.commandLatency)
  Atomics.store(int32View, i32Base + 24, msg.sequenceNum)
  Atomics.store(int32View, i32Base + 25, GPS_FIX_CODES[msg.gpsFixType] ?? 0)
  Atomics.store(int32View, i32Base + 26, msg.armed ? 1 : 0)
  Atomics.store(int32View, i32Base + 27, FLIGHT_MODE_CODES[msg.flightMode] ?? 0)
}

self.onmessage = (event) => {
  const { type, buffer } = event.data

  if (type === 'init') {
    if (buffer) {
      sab = buffer as SharedArrayBuffer
      float64View = new Float64Array(sab)
      int32View = new Int32Array(sab)
      console.info('[telemetry-worker] SAB initialized', { bytes: sab.byteLength })
    } else {
      console.warn('[telemetry-worker] no SAB — Tier A disabled, Tier B only')
    }
    connect()
    setInterval(emitStats, STATS_INTERVAL_MS)
  }
}
