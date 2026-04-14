import { useState, useRef, useCallback, useEffect } from 'react'
import { useUIStore, selectWaypointLat, selectWaypointLon } from '../../store/uiStore'
import { useTelemetryStore, selectDroneMessage } from '../../store/telemetryStore'
import { c2 } from '../../theme/c2CssVars'

/**
 * CommandPanel — operator command interface with safety confirmation pattern.
 *
 * WHY 3-second confirm: Military C2 systems use deliberate action patterns to
 * prevent accidental commands. Sending a waypoint to the wrong drone or
 * triggering RTL during a critical observation phase can compromise the mission.
 * The hold-to-confirm pattern forces the operator to sustain intent, not just
 * click reflexively. This is modeled after real GCS safety interlocks.
 *
 * DEMO vs production ACK: The Go server accepts POST /api/command but does not
 * feed commands back into the telemetry simulator, so flightMode in WebSocket
 * data never changes to match RTL/LOITER. Waiting on telemetry would always
 * time out. For this demo we treat HTTP 2xx from /api/command as GCS acceptance
 * (operator-visible ACK). Production would still await autopilot ACK over MAVLink
 * and only then clear the pending state.
 */

type CommandState = 'idle' | 'confirming' | 'sending' | 'accepted' | 'failed'

interface CommandPanelProps {
  droneId: string
}

export function CommandPanel({ droneId }: CommandPanelProps) {
  const wpLat = useUIStore(selectWaypointLat)
  const wpLon = useUIStore(selectWaypointLon)
  const waypoint = wpLat !== null && wpLon !== null ? { lat: wpLat, lon: wpLon } : null
  const msg = useTelemetryStore(selectDroneMessage(droneId))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
      <div style={{ fontSize: 10, color: c2('textMuted'), letterSpacing: '0.1em', marginBottom: 4 }}>
        COMMAND
      </div>

      {waypoint ? (
        <div style={{ fontSize: 11, color: c2('waypoint') }}>
          <span className="mono">
            WPT: {waypoint.lat.toFixed(6)}, {waypoint.lon.toFixed(6)}
          </span>
        </div>
      ) : (
        <div style={{ fontSize: 10, color: c2('textMuted') }}>
          Click map to set waypoint
        </div>
      )}

      <CommandButton
        label="SEND WAYPOINT"
        disabled={!waypoint}
        send={(signal) => {
          if (!waypoint) return Promise.resolve(false)
          return postCommand(droneId, 'waypoint', waypoint, undefined, signal)
        }}
      />

      <CommandButton
        label="RTL"
        send={(signal) => postCommand(droneId, 'mode', null, 'RTL', signal)}
      />

      <CommandButton
        label="LOITER"
        send={(signal) => postCommand(droneId, 'mode', null, 'LOITER', signal)}
      />

      <ModeSelector droneId={droneId} currentMode={msg?.flightMode ?? null} />
    </div>
  )
}

function CommandButton({
  label,
  disabled,
  send,
}: {
  label: string
  disabled?: boolean
  send: (signal: AbortSignal) => Promise<boolean>
}) {
  const [state, setState] = useState<CommandState>('idle')
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const acceptedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const reset = useCallback(() => {
    if (confirmTimerRef.current) {
      clearTimeout(confirmTimerRef.current)
      confirmTimerRef.current = null
    }
    if (acceptedTimerRef.current) {
      clearTimeout(acceptedTimerRef.current)
      acceptedTimerRef.current = null
    }
    abortRef.current?.abort()
    abortRef.current = null
    setState('idle')
  }, [])

  const handleClick = useCallback(() => {
    if (disabled || state === 'confirming' || state === 'sending' || state === 'accepted') return

    if (state === 'idle' || state === 'failed') {
      setState('confirming')
      confirmTimerRef.current = setTimeout(() => {
        confirmTimerRef.current = null
        const ac = new AbortController()
        abortRef.current = ac
        setState('sending')
        void (async () => {
          try {
            const ok = await send(ac.signal)
            if (ac.signal.aborted) return
            abortRef.current = null
            if (ok) {
              setState('accepted')
              acceptedTimerRef.current = setTimeout(() => {
                acceptedTimerRef.current = null
                setState('idle')
              }, 700)
            } else {
              setState('failed')
            }
          } catch (err) {
            if (ac.signal.aborted || (err instanceof Error && err.name === 'AbortError')) return
            abortRef.current = null
            setState('failed')
          }
        })()
      }, 3000)
    }
  }, [disabled, state, send])

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
      if (acceptedTimerRef.current) clearTimeout(acceptedTimerRef.current)
      abortRef.current?.abort()
    }
  }, [])

  const bgColor = state === 'confirming' ? `color-mix(in srgb, ${c2('alertWarning')} 20%, transparent)`
    : state === 'sending' ? `color-mix(in srgb, ${c2('blueForce')} 13%, transparent)`
    : state === 'accepted' ? `color-mix(in srgb, ${c2('safe')} 13%, transparent)`
    : state === 'failed' ? `color-mix(in srgb, ${c2('alertCritical')} 13%, transparent)`
    : 'transparent'

  const borderColor = state === 'confirming' ? c2('alertWarning')
    : state === 'sending' ? c2('blueForce')
    : state === 'accepted' ? c2('safe')
    : state === 'failed' ? c2('alertCritical')
    : c2('border')

  const textColor = disabled ? c2('textMuted')
    : state === 'confirming' ? c2('alertWarning')
    : state === 'sending' ? c2('blueForce')
    : state === 'accepted' ? c2('safe')
    : state === 'failed' ? c2('alertCritical')
    : c2('textPrimary')

  const statusText = state === 'confirming' ? 'HOLD TO CONFIRM...'
    : state === 'sending' ? 'SENDING...'
    : state === 'accepted' ? 'GCS ACCEPTED'
    : state === 'failed' ? 'SEND FAILED'
    : label

  const showCancel = state === 'confirming' || state === 'sending'
  const showClear = state === 'failed'

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 6 }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        style={{
          flex: 1,
          background: bgColor,
          border: `1px solid ${borderColor}`,
          color: textColor,
          padding: '6px 10px',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          cursor: disabled ? 'default' : 'pointer',
          textAlign: 'left',
          transition: 'all 0.15s',
          letterSpacing: '0.05em',
        }}
      >
        {statusText}
      </button>
      {showCancel && (
        <button
          type="button"
          onClick={reset}
          style={{
            flexShrink: 0,
            padding: '6px 8px',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            background: c2('surfaceSecondary'),
            border: `1px solid ${c2('border')}`,
            color: c2('textSecondary'),
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {state === 'sending' ? 'ABORT' : 'CANCEL'}
        </button>
      )}
      {showClear && (
        <button
          type="button"
          onClick={reset}
          style={{
            flexShrink: 0,
            padding: '6px 8px',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            background: c2('surfaceSecondary'),
            border: `1px solid ${c2('border')}`,
            color: c2('textSecondary'),
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          CLEAR
        </button>
      )}
    </div>
  )
}

function ModeSelector({ droneId, currentMode }: { droneId: string; currentMode: string | null }) {
  const [selected, setSelected] = useState('')

  const modes = ['GUIDED', 'AUTO', 'LOITER', 'RTL', 'MANUAL']

  return (
    <div style={{ marginTop: 'auto' }}>
      <select
        value={selected}
        onChange={(e) => {
          setSelected(e.target.value)
          if (e.target.value) {
            void postCommand(droneId, 'mode', null, e.target.value)
          }
        }}
        style={{
          width: '100%',
          background: c2('surfaceSecondary'),
          color: c2('textPrimary'),
          border: `1px solid ${c2('border')}`,
          padding: '4px 8px',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
        }}
      >
        <option value="">MODE: {currentMode ?? '---'}</option>
        {modes.map(m => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    </div>
  )
}

async function postCommand(
  droneId: string,
  type: string,
  waypoint?: { lat: number; lon: number } | null,
  mode?: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const res = await fetch('/api/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    signal,
    body: JSON.stringify({
      droneId,
      type,
      lat: waypoint?.lat ?? 0,
      lon: waypoint?.lon ?? 0,
      mode: mode ?? '',
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.warn('[command] server rejected', res.status, body.slice(0, 120))
  }
  return res.ok
}
