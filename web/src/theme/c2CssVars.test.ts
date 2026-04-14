import { describe, expect, it } from 'vitest'
import { applyC2CssVariables, c2, c2FlightMode } from './c2CssVars'

describe('c2CssVars', () => {
  it('c2 returns var reference', () => {
    expect(c2('bgPrimary')).toBe('var(--c2-bg-primary)')
    expect(c2('debugHighlightBorder')).toBe('var(--c2-debug-highlight-border)')
  })

  it('c2FlightMode references flight vars', () => {
    expect(c2FlightMode('AUTO')).toContain('--c2-flight-auto')
  })

  it('applyC2CssVariables sets properties from COLORS', () => {
    const el = document.createElement('div')
    applyC2CssVariables(el)
    expect(el.style.getPropertyValue('--c2-bg-primary').trim()).toBe('#1a1f1a')
    expect(el.style.getPropertyValue('--c2-flight-guided').trim()).toBe('#4a9eff')
    expect(el.style.getPropertyValue('--c2-map-tile-gutter').trim()).toBe('#dcdcdc')
  })
})
