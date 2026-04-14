import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { COLORS } from '../../constants/tactical'
import {
  useUIStore,
  selectConnectionState,
  selectReconnectAttempt,
  selectMessagesPerSecond,
  selectLayersDebugVisible,
  selectLayersDebugShowLabels,
} from '../../store/uiStore'
import { LayerTierChip } from '../debug/LayerTierChip'
import { FlirCanvas } from '../video/FlirCanvas'
import { TacticalMap } from '../map/TacticalMap'
import { SummaryStrip } from '../hud/SummaryStrip'
import { DetailPanel } from '../hud/DetailPanel'
import type { DeploymentTopology, DroneInfo } from '../../types/telemetry'

/**
 * AppLayout — primary split layout, fixed viewport, no scroll.
 *
 * Uses CSS Grid with fixed row heights. The detail panel's height is driven
 * by its own internal CSS transition (0 ↔ 200px) so Grid doesn't need to
 * recalculate — the row just uses min-content.
 *
 * Layout:
 * ┌─────────────────────────────────────────────┐
 * │ TOP BAR (32px)                               │
 * ├──────────────────────┬──────────────────────┤
 * │ VIDEO PANEL (55%)    │ TACTICAL MAP (45%)   │
 * │                      │                      │
 * ├──────────────────────┴──────────────────────┤
 * │ DETAIL PANEL (0-200px, animated)             │
 * ├─────────────────────────────────────────────┤
 * │ SUMMARY STRIP (80px)                        │
 * └─────────────────────────────────────────────┘
 */
export function AppLayout() {
  // Tier C: reference data with explicit stale/refetch config.
  const { data: topology } = useQuery<DeploymentTopology>({
    queryKey: ['config'],
    queryFn: () => fetch('/api/config').then(r => r.json()),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  // Tier C: drone registry. Pre-fetched for potential future use (operator
  // assignment, fleet management). The query runs once and caches.
  useQuery<DroneInfo[]>({
    queryKey: ['drones'],
    queryFn: () => fetch('/api/drones').then(r => r.json()),
    staleTime: 30000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  const showTierChips = useUIStore(selectLayersDebugShowLabels)

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'grid',
      gridTemplateRows: '32px 1fr auto 80px',
      gridTemplateColumns: '1fr',
      background: COLORS.bgPrimary,
      overflow: 'hidden',
    }}>
      <TopBar topology={topology ?? null} showTierChips={showTierChips} />

      <div style={{
        display: 'grid',
        gridTemplateColumns: '55fr 45fr',
        borderBottom: `1px solid ${COLORS.border}`,
        overflow: 'hidden',
      }}>
        {/* Video panel: FLIR canvas */}
        <div style={{
          position: 'relative',
          borderRight: `1px solid ${COLORS.border}`,
          overflow: 'hidden',
        }}
        className="scan-lines"
        >
          {showTierChips ? <LayerTierChip text="A + B" /> : null}
          <FlirCanvas />
        </div>

        {/* Tactical map */}
        <div style={{ position: 'relative', overflow: 'hidden' }}>
          {showTierChips ? <LayerTierChip text="A + B" /> : null}
          <TacticalMap />
        </div>
      </div>

      <DetailPanel />
      <div style={{ position: 'relative', height: 80, flexShrink: 0, overflow: 'hidden' }}>
        {showTierChips ? <LayerTierChip text="B" /> : null}
        <SummaryStrip topology={topology ?? null} />
      </div>
    </div>
  )
}

function TopBar({
  topology,
  showTierChips,
}: {
  topology: DeploymentTopology | null
  showTierChips: boolean
}) {
  const connectionState = useUIStore(selectConnectionState)
  const reconnectAttempt = useUIStore(selectReconnectAttempt)
  const mps = useUIStore(selectMessagesPerSecond)
  const layersDebugVisible = useUIStore(selectLayersDebugVisible)
  const [elapsed, setElapsed] = useState('00:00:00')

  // Mission clock: counts up from page load.
  useEffect(() => {
    const start = useUIStore.getState().missionStartTime
    const interval = setInterval(() => {
      const s = Math.floor((Date.now() - start) / 1000)
      const h = String(Math.floor(s / 3600)).padStart(2, '0')
      const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
      const sec = String(s % 60).padStart(2, '0')
      setElapsed(`${h}:${m}:${sec}`)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const connColor = connectionState === 'connected' ? COLORS.safe
    : connectionState === 'reconnecting' ? COLORS.alertWarning
    : COLORS.alertCritical

  const connText = connectionState === 'connected' ? 'CONNECTED'
    : connectionState === 'reconnecting' ? `RECONNECTING (${reconnectAttempt})`
    : 'OFFLINE'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 12px 0 16px',
      borderBottom: `1px solid ${COLORS.border}`,
      background: COLORS.surfacePrimary,
      fontSize: 12,
      gap: 12,
      minWidth: 0,
    }}>
      {/* Left: title + layers (always visible, not buried in status cluster) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <span className="mono" style={{ color: COLORS.textPrimary, fontWeight: 700, letterSpacing: '0.1em' }}>
          DRONE C2 // DEMO
        </span>
        <button
          type="button"
          className="mono"
          title="Open data layer map and live telemetry path. Drag the panel header to move it. Backquote key also toggles."
          onClick={() => useUIStore.getState().toggleLayersDebugPanel()}
          style={{
            padding: '4px 10px',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.12em',
            cursor: 'grab',
            flexShrink: 0,
            background: layersDebugVisible ? COLORS.debugHighlightBg : COLORS.debugHighlightBgPanel,
            color: COLORS.debugHighlightText,
            border: `1px solid ${COLORS.debugHighlightBorder}`,
            boxShadow: layersDebugVisible ? `0 0 0 1px ${COLORS.debugHighlightBorder}` : 'none',
          }}
        >
          DATA LAYERS
        </button>
      </div>

      {/* Center: mission elapsed time */}
      <span className="mono" style={{ color: COLORS.textSecondary, flexShrink: 0 }}>
        T+ {elapsed}
      </span>

      {/* Right: topology mode + connection + drone count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, minWidth: 0 }}>
        {showTierChips ? <LayerTierChip text="C" inline /> : null}
        {topology && (
          <span className="mono" style={{ color: COLORS.textMuted, fontSize: 10 }}>
            {topology.mode.toUpperCase()} / {topology.expectedLatencyMs}ms
          </span>
        )}
        <span style={{
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', background: connColor,
            display: 'inline-block',
          }} />
          <span className="mono" style={{ color: connColor, fontSize: 10 }}>
            {connText}
          </span>
        </span>
        <span className="mono" style={{ color: COLORS.textMuted, fontSize: 10 }}>
          {mps > 0 ? `${mps} msg/s` : '---'}
        </span>
        <span className="mono" style={{ color: COLORS.textMuted, fontSize: 10 }}>
          5 UAS
        </span>
      </div>
    </div>
  )
}
