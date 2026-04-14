import { DRONE_IDS } from '../../constants/tactical'
import { c2 } from '../../theme/c2CssVars'
import { DroneCard } from './DroneCard'
import type { DeploymentTopology } from '../../types/telemetry'

/**
 * SummaryStrip — always-visible bottom bar with 5 drone cards.
 *
 * Fixed 80px height. Each card shows condensed status from Tier B data.
 * Clicking a card selects that drone, which triggers the detail panel
 * slide-up and switches the FLIR canvas target.
 */
export function SummaryStrip({ topology }: { topology: DeploymentTopology | null }) {
  return (
    <div style={{
      height: 80,
      display: 'flex',
      borderTop: `1px solid ${c2('border')}`,
      background: c2('surfacePrimary'),
      flexShrink: 0,
    }}>
      {DRONE_IDS.map((id, idx) => (
        <DroneCard key={id} droneId={id} droneIdx={idx} topology={topology} />
      ))}
    </div>
  )
}
