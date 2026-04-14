/**
 * Tactical design system constants.
 *
 * Every color, threshold, and layout constant lives here — not scattered across
 * components. This makes it trivial to re-skin for different operational contexts
 * (e.g., maritime blue instead of land green) without hunting through 30 files.
 *
 * At runtime, `applyC2CssVariables()` in main.tsx mirrors COLORS onto
 * `document.documentElement` as `--c2-*` so index.css and React inline styles
 * both read the same tokens (see theme/c2CssVars.ts).
 */

// --- Colors ---
// WHY medium-dark, not near-black: Real DoD C2 systems (ATAK, QGroundControl,
// Palantir Gotham) use readable medium-gray palettes — not the "hacker movie"
// aesthetic. Near-black backgrounds with dark green text look cinematic but
// fail in real operational settings (projectors, sunlit TOCs, shared screens).
// This palette is dark enough to feel tactical, light enough to read at a glance.
export const COLORS = {
  bgPrimary: '#1a1f1a',
  surfacePrimary: '#222a22',
  surfaceSecondary: '#2a352a',
  border: '#3d4d3d',

  blueForce: '#4a9eff',
  blueForceTrail: 'rgba(74, 158, 255, 0.3)',
  blueForcePredicted: 'rgba(74, 158, 255, 0.5)',

  waypoint: '#00ffcc',
  geofence: '#ff8c00',

  alertCritical: '#ff3333',
  alertWarning: '#ffcc00',
  safe: '#39ff6e',

  textPrimary: '#e0ece0',
  textSecondary: '#8aaa8a',
  textMuted: '#5a7a5a',

  reticle: '#00ffcc',

  bbVehicle: '#ffcc00',
  bbPersonnel: '#ff3333',
  bbUnknown: '#999999',

  /** Tier / layers debug UI: chips, DATA LAYERS control, floating panel */
  debugHighlightBorder: '#e4c94a',
  debugHighlightBg: 'rgba(255, 236, 160, 0.28)',
  /** Opaque chip fill so tier labels read over video and drone cards */
  debugChipBg: '#3f3b2a',
  /** Flat fill for debug panel body + header (no gradient) */
  debugPanelBg: '#2c2b22',
  debugHighlightBgPanel: 'rgba(255, 240, 180, 0.1)',
  debugHighlightText: '#f5ebb8',
  debugChipText: '#fff9e6',

  /** Leaflet on light raster tiles: controls stay readable */
  mapTileGutter: '#dcdcdc',
  mapControlBg: '#f4f4f4',
  mapControlFg: '#1a1a1a',
  mapControlBorder: '#b0b0b0',
  mapControlBgHover: '#e8e8e8',
  mapAttributionBg: 'rgba(255, 255, 255, 0.88)',
  mapAttributionFg: '#333333',
} as const

// --- Thresholds ---
export const THRESHOLDS = {
  batteryWarning: 50,
  batteryCritical: 20,
  rssiWarning: -70,
  rssiCritical: -80,
  linkQualityWarning: 50,
  linkQualityCritical: 30,
} as const

// --- SharedArrayBuffer Layout ---
// Per-drone byte offsets into the SharedArrayBuffer. 112 bytes per drone.
// This schema is the contract between the Web Worker (writer) and the rAF
// canvas renderers (readers). Changing offsets here requires matching changes
// in telemetry.worker.ts.
export const SAB_OFFSETS = {
  lat: 0,            // Float64
  lon: 8,            // Float64
  altitudeMSL: 16,   // Float64
  altitudeAGL: 24,   // Float64
  groundSpeed: 32,   // Float64
  verticalSpeed: 40, // Float64
  heading: 48,       // Float64
  batteryPercent: 56, // Float64
  rssi: 64,          // Int32
  linkQuality: 68,   // Int32
  satelliteCount: 72, // Int32
  commandLatency: 76, // Int32
  timestamp: 80,     // Float64 (ms since epoch)
  receivedAt: 88,    // Float64 (ms since epoch)
  sequenceNum: 96,   // Int32
  gpsFixType: 100,   // Int32 (encoded)
  armed: 104,        // Int32 (0 or 1)
  flightModeCode: 108, // Int32 (encoded)
} as const

export const SAB_DRONE_STRIDE = 112 // bytes per drone
export const DRONE_COUNT = 5

// Total SAB size: 112 bytes * 5 drones = 560 bytes
export const SAB_TOTAL_SIZE = SAB_DRONE_STRIDE * DRONE_COUNT

// --- Drone IDs ---
export const DRONE_IDS = [
  'drone-1',
  'drone-2',
  'drone-3',
  'drone-4',
  'drone-5',
] as const

export const DRONE_CALLSIGNS: Record<string, string> = {
  'drone-1': 'ALPHA-1',
  'drone-2': 'BRAVO-2',
  'drone-3': 'CHARLIE-3',
  'drone-4': 'DELTA-4',
  'drone-5': 'ECHO-5',
}

// --- Map ---
export const MAP_CENTER: [number, number] = [32.505, -114.405]
/** Initial zoom — slightly closer than 13 so roads/read labels resolve faster. */
export const MAP_ZOOM = 14
/** User-facing max zoom; one step past native lets Leaflet scale tiles (softer but useful). */
export const MAP_MAX_ZOOM = 20
/** Native raster detail for the active basemap (CyclOSM); above this Leaflet overzooms. */
export const MAP_MAX_NATIVE_ZOOM = 20

// --- Tier B debounce ---
export const TIER_B_POST_INTERVAL_MS = 500 // 2 Hz

// --- Trail / prediction ---
export const TRAIL_LENGTH = 30
export const PREDICTION_SECONDS = 30
export const CPA_WARNING_METERS = 200

// --- Frame loop ---
export const FRAME_BUDGET_MS = 14

// --- Flight mode colors ---
export const FLIGHT_MODE_COLORS: Record<string, string> = {
  LOITER: '#ffcc00',
  AUTO: '#39ff6e',
  RTL: '#ff8c00',
  GUIDED: '#4a9eff',
  MANUAL: '#ff3333',
}
