import { describe, expect, it } from 'vitest'
import {
  SAB_DRONE_STRIDE,
  SAB_EO_BASE_BYTE,
  SAB_EO_SLOT_BYTES,
  SAB_EO_SLOT_COUNT,
} from '../constants/tactical'
import { SAB_DRONE_STRIDE_BYTES, sabByteOffsetForDroneIndex } from './droneLayout'

describe('sabByteOffsetForDroneIndex', () => {
  it('matches worker stride', () => {
    expect(SAB_DRONE_STRIDE_BYTES).toBe(272)
    expect(SAB_EO_BASE_BYTE + SAB_EO_SLOT_COUNT * SAB_EO_SLOT_BYTES).toBe(SAB_DRONE_STRIDE)
    expect(sabByteOffsetForDroneIndex(0)).toBe(0)
    expect(sabByteOffsetForDroneIndex(4)).toBe(1088)
  })

  it('rejects invalid index', () => {
    expect(() => sabByteOffsetForDroneIndex(-1)).toThrow(RangeError)
    expect(() => sabByteOffsetForDroneIndex(1.5)).toThrow(RangeError)
  })
})
