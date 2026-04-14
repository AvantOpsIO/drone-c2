import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { loadLayersDebugPrefs, saveLayersDebugPrefs } from '../utils/layersDebugStorage'

export type ConnectionState = 'connected' | 'reconnecting' | 'offline'

function defaultLayersDebugPos(): { x: number, y: number } {
  if (typeof window === 'undefined') return { x: 16, y: 48 }
  return { x: Math.max(16, window.innerWidth - 328), y: 80 }
}

const savedDebug = typeof sessionStorage !== 'undefined' ? loadLayersDebugPrefs() : null
const defaultPos = defaultLayersDebugPos()

interface UIStore {
  selectedDroneId: string | null
  waypointLat: number | null
  waypointLon: number | null
  connectionState: ConnectionState
  reconnectAttempt: number
  missionStartTime: number
  messagesPerSecond: number
  parseErrors: number
  sequenceGaps: number

  layersDebugVisible: boolean
  layersDebugMinimized: boolean
  layersDebugX: number
  layersDebugY: number
  layersDebugShowLabels: boolean

  selectDrone: (id: string | null) => void
  setWaypoint: (lat: number, lon: number) => void
  clearWaypoint: () => void
  setConnectionState: (state: ConnectionState, attempt: number) => void
  setStats: (mps: number, parseErrors: number, gaps: number) => void

  toggleLayersDebugPanel: () => void
  closeLayersDebugPanel: () => void
  setLayersDebugMinimized: (minimized: boolean) => void
  setLayersDebugPos: (x: number, y: number) => void
  setLayersDebugShowLabels: (show: boolean) => void
}

function persistLayersDebug(s: Pick<UIStore,
  'layersDebugX' | 'layersDebugY' | 'layersDebugMinimized' | 'layersDebugShowLabels'
>) {
  saveLayersDebugPrefs({
    x: s.layersDebugX,
    y: s.layersDebugY,
    minimized: s.layersDebugMinimized,
    showLabels: s.layersDebugShowLabels,
  })
}

export const useUIStore = create<UIStore>()(
  subscribeWithSelector((set, get) => ({
    selectedDroneId: null,
    waypointLat: null,
    waypointLon: null,
    connectionState: 'offline' as ConnectionState,
    reconnectAttempt: 0,
    missionStartTime: Date.now(),
    messagesPerSecond: 0,
    parseErrors: 0,
    sequenceGaps: 0,

    layersDebugVisible: false,
    layersDebugMinimized: savedDebug?.minimized ?? false,
    layersDebugX: savedDebug?.x ?? defaultPos.x,
    layersDebugY: savedDebug?.y ?? defaultPos.y,
    layersDebugShowLabels: savedDebug?.showLabels ?? false,

    selectDrone: (id) => set({ selectedDroneId: id }),
    setWaypoint: (lat, lon) => set({ waypointLat: lat, waypointLon: lon }),
    clearWaypoint: () => set({ waypointLat: null, waypointLon: null }),
    setConnectionState: (state, attempt) =>
      set({ connectionState: state, reconnectAttempt: attempt }),
    setStats: (mps, parseErrors, gaps) =>
      set({ messagesPerSecond: mps, parseErrors, sequenceGaps: gaps }),

    toggleLayersDebugPanel: () => {
      const v = get().layersDebugVisible
      if (v) {
        set({ layersDebugVisible: false })
        return
      }
      set({ layersDebugVisible: true, layersDebugMinimized: false })
    },

    closeLayersDebugPanel: () => set({ layersDebugVisible: false }),

    setLayersDebugMinimized: (minimized) => {
      set({ layersDebugMinimized: minimized })
      persistLayersDebug(get())
    },

    setLayersDebugPos: (x, y) => set({ layersDebugX: x, layersDebugY: y }),

    setLayersDebugShowLabels: (show) => {
      set({ layersDebugShowLabels: show })
      persistLayersDebug(get())
    },
  })),
)

export const selectSelectedDroneId = (s: UIStore) => s.selectedDroneId
export const selectConnectionState = (s: UIStore) => s.connectionState
export const selectReconnectAttempt = (s: UIStore) => s.reconnectAttempt
export const selectWaypointLat = (s: UIStore) => s.waypointLat
export const selectWaypointLon = (s: UIStore) => s.waypointLon
export const selectMessagesPerSecond = (s: UIStore) => s.messagesPerSecond
export const selectLayersDebugVisible = (s: UIStore) => s.layersDebugVisible
export const selectLayersDebugMinimized = (s: UIStore) => s.layersDebugMinimized
export const selectLayersDebugPos = (s: UIStore) => ({ x: s.layersDebugX, y: s.layersDebugY })
export const selectLayersDebugShowLabels = (s: UIStore) => s.layersDebugShowLabels
