/**
 * SharedArrayBuffer layout constants (must stay aligned with telemetry.worker.ts).
 */
export const SAB_DRONE_STRIDE_BYTES = 272

export function sabByteOffsetForDroneIndex(droneIdx: number): number {
  if (!Number.isInteger(droneIdx) || droneIdx < 0) {
    throw new RangeError('droneIdx must be a non-negative integer')
  }
  return droneIdx * SAB_DRONE_STRIDE_BYTES
}
