import { useRef, useEffect } from 'react'
import { useTelemetryStore, selectDroneMessage } from '../../store/telemetryStore'
import { useTelemetryContext } from '../../hooks/useTelemetryWorker'
import { useUIStore, selectSelectedDroneId } from '../../store/uiStore'
import {
  THRESHOLDS,
  DRONE_CALLSIGNS,
  SAB_OFFSETS,
  SAB_DRONE_STRIDE,
} from '../../constants/tactical'
import { c2, c2FlightMode } from '../../theme/c2CssVars'
import type { DeploymentTopology } from '../../types/telemetry'

/**
 * DroneCard — compact status card shown in the summary strip.
 *
 * Consumes Tier B data (React/Zustand at 2Hz) for most fields. The data age
 * indicator is the exception: it updates at display refresh rate by reading
 * receivedAt from the SAB and writing directly to a DOM ref.
 *
 * WHY useRef for data age: This value updates every frame (60fps). Going
 * through React's reconciler at that rate costs ~2ms/frame in VDOM diffing.
 * Writing to a ref's textContent is a single DOM property set — zero overhead.
 */
interface DroneCardProps {
  droneId: string
  droneIdx: number
  topology: DeploymentTopology | null
}

export function DroneCard({ droneId, droneIdx, topology }: DroneCardProps) {
  const msg = useTelemetryStore(selectDroneMessage(droneId))
  const selectedId = useUIStore(selectSelectedDroneId)
  const isSelected = selectedId === droneId
  const { float64View } = useTelemetryContext()
  const ageRef = useRef<HTMLSpanElement>(null)

  const callsign = DRONE_CALLSIGNS[droneId] ?? droneId
  const freshnessThreshold = topology?.freshnessThresholdMs ?? 2000

  // Data age updater: reads SAB receivedAt every 100ms via setInterval.
  // WHY setInterval instead of rAF: 100ms is fast enough for a text display
  // and doesn't waste rAF budget that canvas renderers need.
  useEffect(() => {
    const interval = setInterval(() => {
      if (!float64View || !ageRef.current) return
      const off = droneIdx * SAB_DRONE_STRIDE
      const receivedAt = float64View[(off + SAB_OFFSETS.receivedAt) / 8]
      if (receivedAt === 0) {
        ageRef.current.textContent = '---'
        return
      }
      const age = (Date.now() - receivedAt) / 1000
      ageRef.current.textContent = `${age.toFixed(1)}s`

      // Stale detection
      const isStale = (Date.now() - receivedAt) > freshnessThreshold
      ageRef.current.style.color = isStale ? c2('alertWarning') : c2('textSecondary')
    }, 100)

    return () => clearInterval(interval)
  }, [float64View, droneIdx, freshnessThreshold])

  const batteryColor = !msg ? c2('textMuted')
    : msg.batteryPercent > THRESHOLDS.batteryWarning ? c2('safe')
    : msg.batteryPercent > THRESHOLDS.batteryCritical ? c2('alertWarning')
    : c2('alertCritical')

  const linkColor = !msg ? c2('textMuted')
    : msg.linkQuality > THRESHOLDS.linkQualityWarning ? c2('safe')
    : msg.linkQuality > THRESHOLDS.linkQualityCritical ? c2('alertWarning')
    : c2('alertCritical')

  const gpsDot = !msg ? c2('textMuted')
    : msg.gpsFixType === '3D_FIX' || msg.gpsFixType === 'RTK_FLOAT' || msg.gpsFixType === 'RTK_FIXED'
    ? c2('safe')
    : c2('alertWarning')

  const modeFg = msg ? c2FlightMode(msg.flightMode) : c2('textMuted')
  const modeBg = msg
    ? `color-mix(in srgb, ${c2FlightMode(msg.flightMode)} 14%, transparent)`
    : 'transparent'

  return (
    <div
      onClick={() => useUIStore.getState().selectDrone(isSelected ? null : droneId)}
      style={{
        flex: 1,
        padding: '6px 10px',
        borderRight: `1px solid ${c2('border')}`,
        borderTop: `2px solid ${isSelected ? c2('blueForce') : 'transparent'}`,
        background: isSelected ? c2('surfaceSecondary') : c2('surfacePrimary'),
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minWidth: 0,
        transition: 'border-top-color 0.15s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="mono" style={{ fontSize: 12, color: c2('textPrimary'), fontWeight: 700 }}>
          {callsign}
        </span>
        <span className="mono" style={{
          fontSize: 10,
          padding: '1px 5px',
          background: modeBg,
          color: modeFg,
          borderRadius: 2,
        }}>
          {msg?.flightMode ?? '---'}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
        {/* Battery */}
        <span className="mono" style={{ fontSize: 11, color: batteryColor }}>
          {msg ? `${msg.batteryPercent.toFixed(0).padStart(3)}%` : '---'}
        </span>

        {/* GPS dot */}
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: gpsDot, display: 'inline-block',
        }} />

        {/* Armed */}
        <span style={{
          fontSize: 9,
          color: msg?.armed ? c2('alertCritical') : c2('textMuted'),
          fontWeight: 700,
        }}>
          {msg?.armed ? 'ARM' : 'SAFE'}
        </span>
      </div>

      {/* Link quality bar */}
      <div style={{
        height: 3, background: c2('border'), marginTop: 4, borderRadius: 1,
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: msg ? `${msg.linkQuality}%` : '0%',
          background: linkColor,
          transition: 'width 0.3s',
        }} />
      </div>

      {/* Data age */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 2 }}>
        <span ref={ageRef} className="mono" style={{ fontSize: 10, color: c2('textSecondary') }}>
          ---
        </span>
      </div>
    </div>
  )
}
