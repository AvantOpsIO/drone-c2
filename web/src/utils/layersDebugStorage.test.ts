import { afterEach, describe, expect, it } from 'vitest'
import { loadLayersDebugPrefs, saveLayersDebugPrefs } from './layersDebugStorage'

describe('layersDebugStorage', () => {
  afterEach(() => {
    sessionStorage.clear()
  })

  it('roundtrips prefs', () => {
    saveLayersDebugPrefs({ x: 12, y: 34, minimized: true, showLabels: false })
    expect(loadLayersDebugPrefs()).toEqual({
      x: 12,
      y: 34,
      minimized: true,
      showLabels: false,
    })
  })

  it('returns null when missing', () => {
    expect(loadLayersDebugPrefs()).toBeNull()
  })
})
