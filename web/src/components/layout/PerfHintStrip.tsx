import { c2 } from '../../theme/c2CssVars'

/**
 * Thin always visible line so the shell reads as instrumented for latency,
 * not only a skin. Details live in docs/ARCHITECTURE.md and DATA LAYERS.
 */
export function PerfHintStrip() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: '2px 16px',
      borderBottom: `1px solid ${c2('border')}`,
      background: c2('bgPrimary'),
      minHeight: 18,
      overflow: 'hidden',
    }}
    >
      <span
        className="mono"
        title="High level data path. Open DATA LAYERS for tier map."
        style={{
          fontSize: 9,
          color: c2('textMuted'),
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
          overflow: 'hidden',
          width: '100%',
          letterSpacing: '0.02em',
        }}
      >
        Hot path: WS → worker → SharedArrayBuffer; canvases on rAF (Tier A). React via throttled Zustand + HTTP/React Query (B/C). Needs cross origin isolation for SAB.
      </span>
    </div>
  )
}
