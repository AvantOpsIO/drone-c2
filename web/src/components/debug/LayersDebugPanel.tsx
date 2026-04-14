import { useCallback, useEffect, useRef, type CSSProperties } from 'react'
import { c2 } from '../../theme/c2CssVars'
import { useTelemetryContext } from '../../hooks/useTelemetryWorker'
import {
  useUIStore,
  selectConnectionState,
  selectMessagesPerSecond,
  selectLayersDebugVisible,
  selectLayersDebugMinimized,
  selectLayersDebugShowLabels,
} from '../../store/uiStore'
import { saveLayersDebugPrefs } from '../../utils/layersDebugStorage'

const panelStyle: CSSProperties = {
  position: 'fixed',
  zIndex: 10000,
  width: 300,
  maxHeight: 'min(70vh, 520px)',
  display: 'flex',
  flexDirection: 'column',
  background: c2('debugPanelBg'),
  border: `2px solid ${c2('debugHighlightBorder')}`,
  boxShadow: '0 8px 24px rgba(0,0,0,0.55)',
  fontSize: 10,
  fontFamily: "'JetBrains Mono', monospace",
  color: c2('textSecondary'),
  overflow: 'hidden',
}

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '6px 8px',
  background: c2('debugPanelBg'),
  borderBottom: `1px solid color-mix(in srgb, ${c2('debugHighlightBorder')} 45%, transparent)`,
  cursor: 'grab',
  userSelect: 'none',
  flexShrink: 0,
}

const sectionTitle: CSSProperties = {
  color: c2('debugHighlightText'),
  fontWeight: 700,
  marginBottom: 4,
  letterSpacing: '0.06em',
}

function wsUrl(): string {
  const p = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = typeof window !== 'undefined' ? window.location.host : ''
  return `${p}//${host}/ws`
}

export function LayersDebugPanel() {
  const { sab } = useTelemetryContext()
  const visible = useUIStore(selectLayersDebugVisible)
  const minimized = useUIStore(selectLayersDebugMinimized)
  const showLabels = useUIStore(selectLayersDebugShowLabels)
  const x = useUIStore((s) => s.layersDebugX)
  const y = useUIStore((s) => s.layersDebugY)
  const connectionState = useUIStore(selectConnectionState)
  const mps = useUIStore(selectMessagesPerSecond)
  const parseErrors = useUIStore((s) => s.parseErrors)
  const sequenceGaps = useUIStore((s) => s.sequenceGaps)

  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    origX: number
    origY: number
  } | null>(null)

  const persistPos = useCallback(() => {
    const s = useUIStore.getState()
    saveLayersDebugPrefs({
      x: s.layersDebugX,
      y: s.layersDebugY,
      minimized: s.layersDebugMinimized,
      showLabels: s.layersDebugShowLabels,
    })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Backquote') return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return
      e.preventDefault()
      useUIStore.getState().toggleLayersDebugPanel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onHeaderPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    // Buttons live inside the header; do not start drag or capture (breaks click).
    if ((e.target as HTMLElement).closest('button')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: x,
      origY: y,
    }
  }

  const onHeaderPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d || e.pointerId !== d.pointerId) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    let nx = d.origX + dx
    let ny = d.origY + dy
    const pad = 8
    const w = minimized ? 100 : 300
    const h = minimized ? 28 : 400
    nx = Math.max(pad, Math.min(nx, window.innerWidth - w - pad))
    ny = Math.max(pad, Math.min(ny, window.innerHeight - h - pad))
    useUIStore.getState().setLayersDebugPos(nx, ny)
  }

  const endDrag = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d || e.pointerId !== d.pointerId) return
    dragRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    persistPos()
  }

  if (!visible) return null

  if (minimized) {
    return (
      <div
        title="Drag to move. Click LAYERS to expand."
        style={{
          ...panelStyle,
          width: 'auto',
          minWidth: 88,
          maxHeight: 'none',
          left: x,
          top: y,
        }}
      >
        <div
          style={{ ...headerStyle, cursor: 'grab', borderBottom: 'none' }}
          onPointerDown={onHeaderPointerDown}
          onPointerMove={onHeaderPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <button
            type="button"
            className="mono"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => useUIStore.getState().setLayersDebugMinimized(false)}
            style={{
              background: 'none',
              border: 'none',
              color: c2('textPrimary'),
              cursor: 'pointer',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.08em',
              padding: 0,
            }}
          >
            LAYERS
          </button>
          <button
            type="button"
            aria-label="Close"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(ev) => {
              ev.stopPropagation()
              useUIStore.getState().closeLayersDebugPanel()
            }}
            style={{
              marginLeft: 8,
              background: c2('debugHighlightBgPanel'),
              border: `1px solid ${c2('debugHighlightBorder')}`,
              color: c2('debugHighlightText'),
              cursor: 'pointer',
              fontSize: 9,
              padding: '0 6px',
            }}
          >
            X
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ ...panelStyle, left: x, top: y }}>
      <div
        title="Drag this header to move the panel"
        style={{
          ...headerStyle,
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: 4,
          padding: '8px 8px 6px',
        }}
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span className="mono" style={{ color: c2('textPrimary'), fontWeight: 700, fontSize: 10 }}>
              DATA LAYERS
            </span>
            <span
              className="mono"
              style={{
                fontSize: 8,
                color: c2('debugHighlightBorder'),
                fontWeight: 600,
                letterSpacing: '0.08em',
              }}
            >
              DRAG THIS BAR TO MOVE
            </span>
          </div>
          <span style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            <button
              type="button"
              title="Minimize"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => useUIStore.getState().setLayersDebugMinimized(true)}
              style={{
                background: c2('debugHighlightBgPanel'),
                border: `1px solid ${c2('debugHighlightBorder')}`,
                color: c2('debugHighlightText'),
                cursor: 'pointer',
                fontSize: 9,
                padding: '0 6px',
              }}
            >
              _
            </button>
            <button
              type="button"
              aria-label="Close"
              title="Close"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => useUIStore.getState().closeLayersDebugPanel()}
              style={{
                background: c2('debugHighlightBgPanel'),
                border: `1px solid ${c2('debugHighlightBorder')}`,
                color: c2('debugHighlightText'),
                cursor: 'pointer',
                fontSize: 9,
                padding: '0 6px',
              }}
            >
              X
            </button>
          </span>
        </div>
      </div>

      <div style={{ padding: '8px 10px', overflowY: 'auto', flex: 1 }}>
        <div style={{ marginBottom: 10 }}>
          <div style={sectionTitle}>LIVE</div>
          <div>WS {wsUrl()}</div>
          <div>Link {connectionState}</div>
          <div>SAB {sab ? 'active' : 'off (Tier A canvas path off)'}</div>
          <div>Throughput {mps > 0 ? `${mps} msg/s` : '…'} (5s sample)</div>
          <div>Parse err {parseErrors} · Seq gaps {sequenceGaps}</div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={sectionTitle}>TIER A</div>
          <div>WebSocket to worker, numeric SharedArrayBuffer, rAF canvases.</div>
          <div style={{ marginTop: 4, color: c2('textMuted') }}>
            About 10 Hz per drone on the wire. Draw loop follows display refresh.
          </div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={sectionTitle}>TIER B</div>
          <div>postMessage to Zustand, about 2 Hz plus urgent (mode, armed, alerts).</div>
          <div style={{ marginTop: 4, color: c2('textMuted') }}>
            Cards, detail, summary strip, trails, bounding boxes.
          </div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={sectionTitle}>TIER C</div>
          <div>HTTP + React Query. Config long cache, drones about 30 s.</div>
        </div>

        <div style={{ marginBottom: 8 }}>
          <div style={sectionTitle}>REGIONS</div>
          <div>Video FLIR: Tier A draw + Tier B boxes.</div>
          <div>Map tracks: Tier A heads + Tier B trails.</div>
          <div>Strip + cards: Tier B. Topology line in bar: Tier C.</div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showLabels}
            onChange={(e) => useUIStore.getState().setLayersDebugShowLabels(e.target.checked)}
          />
          <span>Show region chips</span>
        </label>

        <div style={{ marginTop: 10, color: c2('textMuted'), fontSize: 9 }}>
          Toggle: DATA LAYERS in top bar or Backquote key (not in inputs).
        </div>
      </div>
    </div>
  )
}
