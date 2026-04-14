/**
 * TypeScript mirror of Go's TelemetryMessage struct (internal/telemetry/types.go).
 * Keeping these in sync manually is intentional — a shared schema generator
 * (protobuf, etc.) is overkill for 5 drones. If this were production with
 * multiple consumers, we'd generate from a .proto file.
 */
export interface TelemetryMessage {
  droneId: string
  timestamp: string
  receivedAt: string
  sequenceNum: number

  lat: number
  lon: number
  altitudeMSL: number
  altitudeAGL: number
  groundSpeed: number
  verticalSpeed: number
  heading: number

  flightMode: FlightMode
  armed: boolean

  batteryVoltage: number
  batteryPercent: number
  batteryTimeRemaining: number

  rssi: number
  linkQuality: number

  gpsFixType: GPSFixType
  satelliteCount: number

  commandLatency: number

  iffMode: IFFMode
  encryptionStatus: EncryptionStatus

  boundingBoxes: BoundingBox[]
}

export interface BoundingBox {
  trackId: string
  label: 'VEHICLE' | 'PERSONNEL' | 'UNKNOWN'
  confidence: number
  x: number
  y: number
  w: number
  h: number
}

export type FlightMode = 'LOITER' | 'AUTO' | 'RTL' | 'GUIDED' | 'MANUAL'
export type GPSFixType = 'NO_FIX' | '2D_FIX' | '3D_FIX' | 'RTK_FLOAT' | 'RTK_FIXED'
export type IFFMode = 'STANDBY' | 'MODE_1' | 'MODE_3' | 'EMERGENCY'
export type EncryptionStatus = 'ENCRYPTED' | 'UNENCRYPTED' | 'UNKNOWN'

export interface DroneInfo {
  id: string
  callsign: string
}

export interface DeploymentTopology {
  mode: string
  expectedLatencyMs: number
  freshnessThresholdMs: number
  maxDroneCount: number
}

/**
 * Maps string enums to integer codes for SharedArrayBuffer storage.
 * SAB can only store numbers — string fields go through Tier B postMessage.
 */
export const GPS_FIX_CODES: Record<GPSFixType, number> = {
  NO_FIX: 0,
  '2D_FIX': 1,
  '3D_FIX': 2,
  RTK_FLOAT: 3,
  RTK_FIXED: 4,
}

export const FLIGHT_MODE_CODES: Record<FlightMode, number> = {
  LOITER: 0,
  AUTO: 1,
  RTL: 2,
  GUIDED: 3,
  MANUAL: 4,
}

export const GPS_FIX_LABELS: Record<number, GPSFixType> = {
  0: 'NO_FIX',
  1: '2D_FIX',
  2: '3D_FIX',
  3: 'RTK_FLOAT',
  4: 'RTK_FIXED',
}

export const FLIGHT_MODE_LABELS: Record<number, FlightMode> = {
  0: 'LOITER',
  1: 'AUTO',
  2: 'RTL',
  3: 'GUIDED',
  4: 'MANUAL',
}
