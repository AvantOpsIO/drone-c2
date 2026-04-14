import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createElement } from 'react'
import { SAB_TOTAL_SIZE } from '../constants/tactical'
import { useTelemetryStore } from '../store/telemetryStore'
import { useUIStore } from '../store/uiStore'
import type { TelemetryMessage } from '../types/telemetry'

// WHY ?worker suffix: Vite's worker import returns a Worker constructor that
// handles bundling, URL generation, and module format automatically. This is
// more reliable across Vite versions than ?worker&url which changed behavior
// in Vite 8 (Rolldown).
import TelemetryWorker from '../workers/telemetry.worker.ts?worker'

interface TelemetryContextValue {
  sab: SharedArrayBuffer | null
  float64View: Float64Array | null
  int32View: Int32Array | null
}

const TelemetryContext = createContext<TelemetryContextValue>({
  sab: null,
  float64View: null,
  int32View: null,
})

/**
 * Provides the SharedArrayBuffer reference to all descendant components.
 *
 * WHY context for SAB: Canvas renderers need the raw SAB reference to read
 * during rAF. Zustand would work but adds an unnecessary subscription layer
 * for a value that never changes after initialization. React context with a
 * stable reference (set once, never updated) costs exactly zero re-renders.
 */
export function TelemetryProvider({ children }: { children: ReactNode }) {
  const workerRef = useRef<Worker | null>(null)
  const [ctx, setCtx] = useState<TelemetryContextValue>({
    sab: null,
    float64View: null,
    int32View: null,
  })

  useEffect(() => {
    if (typeof SharedArrayBuffer === 'undefined') {
      console.error(
        '[telemetry] SharedArrayBuffer not available. ' +
        'Ensure COOP/COEP headers are set. Tier A disabled.'
      )
    }

    const sab = typeof SharedArrayBuffer !== 'undefined'
      ? new SharedArrayBuffer(SAB_TOTAL_SIZE)
      : null

    if (sab) {
      setCtx({
        sab,
        float64View: new Float64Array(sab),
        int32View: new Int32Array(sab),
      })
    }

    const worker = new TelemetryWorker()
    workerRef.current = worker

    if (sab) {
      worker.postMessage({ type: 'init', buffer: sab })
    } else {
      // No SAB available — tell worker to connect anyway so Tier B still works.
      worker.postMessage({ type: 'init', buffer: null })
    }

    worker.onmessage = (event) => {
      const msg = event.data

      if (msg.type === 'telemetry') {
        useTelemetryStore.getState().updateDrone(msg.data as TelemetryMessage)
      } else if (msg.type === 'connection') {
        const setConnection = useUIStore.getState().setConnectionState
        if (msg.state === 'connected') {
          setConnection('connected', 0)
        } else if (msg.state === 'reconnecting') {
          setConnection('reconnecting', msg.attempt ?? 0)
        } else {
          setConnection('offline', 0)
        }
      } else if (msg.type === 'stats') {
        useUIStore.getState().setStats(
          msg.messagesPerSecond ?? 0,
          msg.parseErrors ?? 0,
          msg.sequenceGaps ?? 0,
        )
      }
    }

    worker.onerror = (e) => {
      console.error('[telemetry] worker error', e)
    }

    return () => {
      worker.terminate()
    }
  }, [])

  return createElement(TelemetryContext.Provider, { value: ctx }, children)
}

export function useTelemetryContext() {
  return useContext(TelemetryContext)
}
