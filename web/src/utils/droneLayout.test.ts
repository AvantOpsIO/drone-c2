import { describe, expect, it } from 'vitest'
import { SAB_DRONE_STRIDE_BYTES, sabByteOffsetForDroneIndex } from './droneLayout'

describe('sabByteOffsetForDroneIndex', () => {
  it('matches worker stride', () => {
    expect(SAB_DRONE_STRIDE_BYTES).toBe(112)
    expect(sabByteOffsetForDroneIndex(0)).toBe(0)
    expect(sabByteOffsetForDroneIndex(4)).toBe(448)
  })

  it('rejects invalid index', () => {
    expect(() => sabByteOffsetForDroneIndex(-1)).toThrow(RangeError)
    expect(() => sabByteOffsetForDroneIndex(1.5)).toThrow(RangeError)
  })
})
