import { COLORS, FLIGHT_MODE_COLORS } from '../constants/tactical'

function camelToKebab(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
}

export type C2ColorKey = keyof typeof COLORS

/**
 * CSS variable reference for inline styles. Values come from `COLORS` in
 * tactical.ts, injected on the document root by `applyC2CssVariables`.
 */
export function c2(key: C2ColorKey): string {
  return `var(--c2-${camelToKebab(key)})`
}

/** Flight mode line in cards; vars set from FLIGHT_MODE_COLORS. */
export function c2FlightMode(mode: string): string {
  return `var(--c2-flight-${mode.toLowerCase()}, var(--c2-text-secondary))`
}

/**
 * Call once before paint (main.tsx). Keeps tactical.ts the single source;
 * index.css and components use var(--c2-*).
 */
export function applyC2CssVariables(target: HTMLElement = document.documentElement): void {
  for (const key of Object.keys(COLORS) as C2ColorKey[]) {
    target.style.setProperty(`--c2-${camelToKebab(key)}`, COLORS[key])
  }
  for (const [mode, hex] of Object.entries(FLIGHT_MODE_COLORS)) {
    target.style.setProperty(`--c2-flight-${mode.toLowerCase()}`, hex)
  }
}
