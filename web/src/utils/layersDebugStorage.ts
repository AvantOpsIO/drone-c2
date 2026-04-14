const STORAGE_KEY = 'c2_layers_debug'

export interface LayersDebugPersisted {
  x: number
  y: number
  minimized: boolean
  showLabels: boolean
}

export function loadLayersDebugPrefs(): Partial<LayersDebugPersisted> | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as Record<string, unknown>
    const x = typeof o.x === 'number' ? o.x : undefined
    const y = typeof o.y === 'number' ? o.y : undefined
    const minimized = typeof o.minimized === 'boolean' ? o.minimized : undefined
    const showLabels = typeof o.showLabels === 'boolean' ? o.showLabels : undefined
    if (x === undefined && y === undefined && minimized === undefined && showLabels === undefined) return null
    return { x, y, minimized, showLabels }
  } catch {
    return null
  }
}

export function saveLayersDebugPrefs(p: LayersDebugPersisted) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(p))
  } catch {
    /* ignore quota */
  }
}
