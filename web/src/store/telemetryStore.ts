import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { TelemetryMessage, BoundingBox } from '../types/telemetry'
import { TRAIL_LENGTH, DRONE_IDS } from '../constants/tactical'

/**
 * Tier B telemetry store.
 *
 * WHY Zustand: Fine-grained selectors prevent re-renders of unrelated
 * components. When drone-1's battery changes, only DroneCard for drone-1
 * re-renders — not all five. Updated at ~2Hz from the Web Worker.
 */

interface DroneState {
  lastMessage: TelemetryMessage | null
  trail: Array<{ lat: number; lon: number }>
  boundingBoxes: BoundingBox[]
}

interface TelemetryStore {
  drones: Record<string, DroneState>
  updateDrone: (msg: TelemetryMessage) => void
}

function createInitialDrones(): Record<string, DroneState> {
  const drones: Record<string, DroneState> = {}
  for (const id of DRONE_IDS) {
    drones[id] = { lastMessage: null, trail: [], boundingBoxes: [] }
  }
  return drones
}

export const useTelemetryStore = create<TelemetryStore>()(
  subscribeWithSelector((set) => ({
    drones: createInitialDrones(),

    updateDrone: (msg: TelemetryMessage) =>
      set((state) => {
        const prev = state.drones[msg.droneId]
        if (!prev) return state

        const trail = [...prev.trail, { lat: msg.lat, lon: msg.lon }]
        if (trail.length > TRAIL_LENGTH) {
          trail.splice(0, trail.length - TRAIL_LENGTH)
        }

        return {
          drones: {
            ...state.drones,
            [msg.droneId]: {
              lastMessage: msg,
              trail,
              boundingBoxes: msg.boundingBoxes ?? [],
            },
          },
        }
      }),
  })),
)

export const selectDrone = (droneId: string) => (state: TelemetryStore) =>
  state.drones[droneId]

export const selectDroneMessage = (droneId: string) => (state: TelemetryStore) =>
  state.drones[droneId]?.lastMessage ?? null

export const selectDroneTrail = (droneId: string) => (state: TelemetryStore) =>
  state.drones[droneId]?.trail ?? []

export const selectBoundingBoxes = (droneId: string) => (state: TelemetryStore) =>
  state.drones[droneId]?.boundingBoxes ?? []
