/**
 * Copies server-authored synthetic EO contacts into the SharedArrayBuffer.
 * Extracted for unit tests; worker calls this with the live Float64Array view.
 */

import type { TelemetryMessage } from '../types/telemetry'
import {
  DRONE_IDS,
  SAB_DRONE_STRIDE,
  SAB_EO_BASE_BYTE,
  SAB_EO_SLOT_BYTES,
  SAB_EO_SLOT_COUNT,
} from '../constants/tactical'

export function writeSyntheticEOToSAB(
  float64View: Float64Array,
  droneIdx: number,
  msg: TelemetryMessage,
): void {
  const byteOffset = droneIdx * SAB_DRONE_STRIDE
  const others = DRONE_IDS.filter((_, i) => i !== droneIdx)
  const byTarget = new Map(
    (msg.syntheticEOContacts ?? []).map((c) => [c.targetDroneId, c]),
  )
  for (let s = 0; s < SAB_EO_SLOT_COUNT; s++) {
    const tid = others[s]!
    const c = byTarget.get(tid)
    const baseByte = byteOffset + SAB_EO_BASE_BYTE + s * SAB_EO_SLOT_BYTES
    const fi = baseByte / 8
    if (c?.visible) {
      float64View[fi] = c.normX
      float64View[fi + 1] = c.normY
      float64View[fi + 2] = 1
      float64View[fi + 3] = c.deltaMslM ?? 0
      float64View[fi + 4] = c.slantRangeM ?? 0
    } else {
      float64View[fi] = 0
      float64View[fi + 1] = 0
      float64View[fi + 2] = 0
      float64View[fi + 3] = 0
      float64View[fi + 4] = 0
    }
  }
}
