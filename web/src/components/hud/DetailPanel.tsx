import { useUIStore, selectSelectedDroneId } from '../../store/uiStore'
import { useTelemetryStore, selectDroneMessage } from '../../store/telemetryStore'
import { DRONE_CALLSIGNS } from '../../constants/tactical'
import { c2 } from '../../theme/c2CssVars'
import { CommandPanel } from '../command/CommandPanel'

/**
 * DetailPanel — expanded telemetry readout and command interface.
 *
 * WHY CSS transition for slide: JavaScript-driven animations block the main
 * thread during the animation. CSS transitions are compositor-driven and run
 * at 60fps independent of JS workload. Given that our rAF loop is already
 * busy with canvas rendering, offloading UI animation to the compositor is
 * a meaningful optimization, not just aesthetics.
 */
export function DetailPanel() {
  const selectedId = useUIStore(selectSelectedDroneId)
  const msg = useTelemetryStore(selectDroneMessage(selectedId ?? ''))

  const isOpen = selectedId !== null
  const callsign = selectedId ? (DRONE_CALLSIGNS[selectedId] ?? selectedId) : ''

  return (
    <div style={{
      height: isOpen ? 200 : 0,
      overflow: 'hidden',
      transition: 'height 0.25s ease-out',
      borderTop: isOpen ? `1px solid ${c2('border')}` : 'none',
      background: c2('surfacePrimary'),
      display: 'flex',
      flexShrink: 0,
    }}>
      {isOpen && msg && (
        <>
          {/* Left: telemetry readout */}
          <div style={{
            flex: 1,
            padding: '10px 16px',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '4px 16px',
            alignContent: 'start',
            overflow: 'hidden',
          }}>
            <TelValue label="CALLSIGN" value={callsign} />
            <TelValue label="FLIGHT MODE" value={msg.flightMode} color={msg.flightMode === 'RTL' ? c2('alertWarning') : c2('safe')} />
            <TelValue label="ARMED" value={msg.armed ? 'ARMED' : 'SAFE'} color={msg.armed ? c2('alertCritical') : c2('safe')} />
            <TelValue label="IFF" value={msg.iffMode} />

            <TelValue label="LAT" value={msg.lat.toFixed(6)} />
            <TelValue label="LON" value={msg.lon.toFixed(6)} />
            <TelValue label="ALT MSL" value={`${msg.altitudeMSL.toFixed(0).padStart(5)}m`} />
            <TelValue label="ALT AGL" value={`${msg.altitudeAGL.toFixed(0).padStart(5)}m`} />

            <TelValue label="GND SPD" value={`${msg.groundSpeed.toFixed(1).padStart(6)} m/s`} />
            <TelValue
              label="VERT SPD"
              value={`${msg.verticalSpeed >= 0 ? '\u2191' : '\u2193'}${Math.abs(msg.verticalSpeed).toFixed(1).padStart(5)} m/s`}
            />
            <TelValue label="HDG" value={`${msg.heading.toFixed(0).padStart(5)}\u00B0`} extra={
              <CompassRose heading={msg.heading} />
            } />
            <TelValue label="ENCRYPTION" value={msg.encryptionStatus} icon={msg.encryptionStatus === 'ENCRYPTED' ? '\uD83D\uDD12' : '\uD83D\uDD13'} />

            <TelValue label="BATT" value={`${msg.batteryVoltage.toFixed(1)}V ${msg.batteryPercent.toFixed(0)}%`}
              color={msg.batteryPercent < 20 ? c2('alertCritical') : msg.batteryPercent < 50 ? c2('alertWarning') : c2('safe')} />
            <TelValue label="BATT TIME" value={`${Math.floor(msg.batteryTimeRemaining / 60)}m ${msg.batteryTimeRemaining % 60}s`} />
            <TelValue label="RSSI" value={`${msg.rssi} dBm`}
              color={msg.rssi < -80 ? c2('alertCritical') : msg.rssi < -70 ? c2('alertWarning') : c2('safe')} />
            <TelValue label="LINK" value={`${msg.linkQuality}%`}
              color={msg.linkQuality < 30 ? c2('alertCritical') : msg.linkQuality < 50 ? c2('alertWarning') : c2('safe')} />

            <TelValue label="GPS" value={`${msg.gpsFixType} (${msg.satelliteCount} sats)`} />
            <TelValue label="CMD LAT" value={`${msg.commandLatency}ms`} />
          </div>

          {/* Right: command panel */}
          <div style={{
            width: 280,
            borderLeft: `1px solid ${c2('border')}`,
            padding: '10px 12px',
            flexShrink: 0,
          }}>
            <CommandPanel droneId={selectedId!} />
          </div>
        </>
      )}
    </div>
  )
}

function TelValue({ label, value, color, extra, icon }: {
  label: string
  value: string
  color?: string
  extra?: React.ReactNode
  icon?: string
}) {
  return (
    <div style={{ lineHeight: 1.3 }}>
      <div style={{ fontSize: 9, color: c2('textMuted'), letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {icon && <span style={{ fontSize: 12 }}>{icon}</span>}
        <span className="mono" style={{
          fontSize: 12,
          color: color ?? c2('textPrimary'),
          whiteSpace: 'nowrap',
        }}>
          {value}
        </span>
        {extra}
      </div>
    </div>
  )
}

/**
 * Tiny SVG compass rose that rotates with CSS transform.
 * WHY SVG + CSS rotate: SVG is resolution-independent and the rotation is
 * a compositor-only CSS transform — no layout, no paint, no JS.
 */
function CompassRose({ heading }: { heading: number }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18"
      style={{ transform: `rotate(${heading}deg)`, transition: 'transform 0.2s' }}>
      <circle cx="9" cy="9" r="8" fill="none" stroke={c2('textMuted')} strokeWidth="1" />
      <line x1="9" y1="9" x2="9" y2="2" stroke={c2('alertCritical')} strokeWidth="1.5" />
      <line x1="9" y1="9" x2="9" y2="16" stroke={c2('textMuted')} strokeWidth="1" />
    </svg>
  )
}
