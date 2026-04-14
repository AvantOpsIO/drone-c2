import { COLORS } from '../../constants/tactical'

const chipBase = {
  padding: '2px 6px',
  fontSize: 9,
  background: COLORS.debugHighlightBg,
  border: `1px solid ${COLORS.debugHighlightBorder}`,
  color: COLORS.debugHighlightText,
  pointerEvents: 'none' as const,
  letterSpacing: '0.04em',
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
    <div className="mono" style={{ ...chipBase, position: 'absolute', top: 6, left: 6, zIndex: 6 }}>
      {text}
    </div>
  )
}
