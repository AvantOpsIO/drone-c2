import { describe, expect, it } from 'vitest'
import {
  SAB_DRONE_STRIDE,
  SAB_EO_BASE_BYTE,
  SAB_EO_SLOT_BYTES,
} from '../constants/tactical'
import type { TelemetryMessage } from '../types/telemetry'
import { writeSyntheticEOToSAB } from './writeSyntheticEOToSAB'

function readEO(float64View: Float64Array, droneIdx: number, slot: number) {
  const baseByte = droneIdx * SAB_DRONE_STRIDE + SAB_EO_BASE_BYTE + slot * SAB_EO_SLOT_BYTES
  const fi = baseByte / 8
  return {
    normX: float64View[fi],
    normY: float64View[fi + 1],
    vis: float64View[fi + 2],
    deltaMsl: float64View[fi + 3],
    slant: float64View[fi + 4],
  }
}

describe('writeSyntheticEOToSAB', () => {
  it('writes visible contact for first other slot (drone-1 row → drone-2)', () => {
    const buf = new ArrayBuffer(SAB_DRONE_STRIDE * 5)
    const f64 = new Float64Array(buf)
    const msg: TelemetryMessage = {
      droneId: 'drone-1',
      timestamp: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      sequenceNum: 1,
      lat: 0,
      lon: 0,
      altitudeMSL: 0,
      altitudeAGL: 0,
      groundSpeed: 0,
      verticalSpeed: 0,
      heading: 0,
      flightMode: 'GUIDED',
      armed: false,
      batteryVoltage: 0,
      batteryPercent: 100,
      batteryTimeRemaining: 0,
      rssi: 0,
      linkQuality: 100,
      gpsFixType: '3D_FIX',
      satelliteCount: 12,
      commandLatency: 0,
      iffMode: 'MODE_3',
      encryptionStatus: 'ENCRYPTED',
      boundingBoxes: [],
      syntheticEOContacts: [
        {
          targetDroneId: 'drone-2',
          normX: 0.62,
          normY: 0.38,
          visible: true,
          deltaMslM: 15,
          slantRangeM: 1200,
        },
      ],
    }
    writeSyntheticEOToSAB(f64, 0, msg)
    const slot0 = readEO(f64, 0, 0)
    expect(slot0.vis).toBe(1)
    expect(slot0.normX).toBe(0.62)
    expect(slot0.normY).toBe(0.38)
    expect(slot0.deltaMsl).toBe(15)
    expect(slot0.slant).toBe(1200)
  })

  it('zeros slot when contact missing or not visible', () => {
    const buf = new ArrayBuffer(SAB_DRONE_STRIDE * 5)
    const f64 = new Float64Array(buf)
    f64.fill(99)
    const msg: TelemetryMessage = {
      droneId: 'drone-1',
      timestamp: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      sequenceNum: 1,
      lat: 0,
      lon: 0,
      altitudeMSL: 0,
      altitudeAGL: 0,
      groundSpeed: 0,
      verticalSpeed: 0,
      heading: 0,
      flightMode: 'GUIDED',
      armed: false,
      batteryVoltage: 0,
      batteryPercent: 100,
      batteryTimeRemaining: 0,
      rssi: 0,
      linkQuality: 100,
      gpsFixType: '3D_FIX',
      satelliteCount: 12,
      commandLatency: 0,
      iffMode: 'MODE_3',
      encryptionStatus: 'ENCRYPTED',
      boundingBoxes: [],
      syntheticEOContacts: [
        { targetDroneId: 'drone-2', normX: 0.5, normY: 0.5, visible: false, deltaMslM: 0, slantRangeM: 0 },
      ],
    }
    writeSyntheticEOToSAB(f64, 0, msg)
    const slot0 = readEO(f64, 0, 0)
    expect(slot0.vis).toBe(0)
    expect(slot0.normX).toBe(0)
    expect(slot0.deltaMsl).toBe(0)
  })
})
