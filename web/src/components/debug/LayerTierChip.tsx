import { c2 } from '../../theme/c2CssVars'

const chipBase = {
  padding: '4px 8px',
  fontSize: 10,
  fontWeight: 700,
  background: c2('debugChipBg'),
  border: `2px solid ${c2('debugHighlightBorder')}`,
  color: c2('debugChipText'),
  letterSpacing: '0.06em',
  pointerEvents: 'none' as const,
  textShadow: '0 1px 2px rgba(0,0,0,0.85)',
  boxShadow: '0 2px 8px rgba(0,0,0,0.55)',
}

export function LayerTierChip({ text, inline }: { text: string, inline?: boolean }) {
  if (inline) {
    return (
      <span className="mono" style={chipBase}>
        {text}
      </span>
    )
  }
  return (
    <div className="mono" style={{ ...chipBase, position: 'absolute', top: 6, left: 6, zIndex: 40 }}>
      {text}
    </div>
  )
}
