package telemetry

import "math"

const metersPerDegreeLatEO = 111_320.0

func metersPerDegreeLonEO(lat float64) float64 {
	return 111_320.0 * math.Cos(lat*math.Pi/180)
}

// SyntheticEOParams configures the notional fixed camera on the synthetic feed.
type SyntheticEOParams struct {
	HorizontalFOVDeg float64
	VerticalFOVDeg   float64
	// DepressionDeg is how many degrees below the horizon the boresight points (positive = look down).
	DepressionDeg float64
	MaxRangeM     float64
}

// DefaultSyntheticEOParams matches the demo FLIR reticle feel.
func DefaultSyntheticEOParams() SyntheticEOParams {
	return SyntheticEOParams{
		HorizontalFOVDeg: 55,
		VerticalFOVDeg:   40,
		DepressionDeg:    12,
		MaxRangeM:        3000,
	}
}

func normalizeAngleRad(a float64) float64 {
	for a > math.Pi {
		a -= 2 * math.Pi
	}
	for a < -math.Pi {
		a += 2 * math.Pi
	}
	return a
}

// ProjectSyntheticEOContact maps a target WGS84 position into normalized FLIR
// frame coordinates [0,1] for the owning aircraft's synthetic EO/IR track list.
// It also returns fused-track ΔMSL and slant range for symbology (computed here, not in the UI).
// Heading follows the simulator: 0° = north, clockwise positive.
func ProjectSyntheticEOContact(p SyntheticEOParams, ownLat, ownLon, ownAltMSL, ownHeadingDeg, tgtLat, tgtLon, tgtAltMSL float64) (normX, normY float64, visible bool, deltaMslM, slantRangeM float64) {
	dNorth := (tgtLat - ownLat) * metersPerDegreeLatEO
	dEast := (tgtLon - ownLon) * metersPerDegreeLonEO(ownLat)
	groundRange := math.Hypot(dNorth, dEast)
	deltaMslM = tgtAltMSL - ownAltMSL
	slantRangeM = math.Hypot(groundRange, deltaMslM)

	if groundRange > p.MaxRangeM {
		return 0, 0, false, deltaMslM, slantRangeM
	}
	gr := groundRange
	if gr < 0.5 {
		gr = 0.5
	}

	// Bearing from north to target, radians (clockwise from north = atan2(E,N)).
	bearing := math.Atan2(dEast, dNorth)
	headingRad := ownHeadingDeg * math.Pi / 180
	relAz := normalizeAngleRad(bearing - headingRad)

	// Behind the aircraft (not in forward hemisphere).
	if math.Abs(relAz) >= math.Pi/2-1e-9 {
		return 0, 0, false, deltaMslM, slantRangeM
	}

	elev := math.Atan2(deltaMslM, gr)
	halfH := p.HorizontalFOVDeg * math.Pi / 180 / 2
	halfV := p.VerticalFOVDeg * math.Pi / 180 / 2
	depr := p.DepressionDeg * math.Pi / 180
	// Boresight is depressed below horizon; target elevation relative to boresight.
	relEl := elev + depr

	if math.Abs(relAz) > halfH || math.Abs(relEl) > halfV {
		return 0, 0, false, deltaMslM, slantRangeM
	}

	normX = 0.5 + 0.5*(relAz/halfH)
	normY = 0.5 - 0.5*(relEl/halfV)
	return normX, normY, true, deltaMslM, slantRangeM
}

// HubDroneIDs is the canonical fleet order for EO contact slots and the hub.
var HubDroneIDs = []string{
	"drone-1", "drone-2", "drone-3", "drone-4", "drone-5",
}

// BuildSyntheticEOContacts fills one entry per other drone in HubDroneIDs order.
func BuildSyntheticEOContacts(own TelemetryMessage, world map[string]TelemetryMessage, p SyntheticEOParams) []SyntheticEOContact {
	var out []SyntheticEOContact
	for _, id := range HubDroneIDs {
		if id == own.DroneID {
			continue
		}
		tgt, ok := world[id]
		if !ok {
			out = append(out, SyntheticEOContact{TargetDroneID: id, Visible: false})
			continue
		}
		nx, ny, vis, dMsl, slant := ProjectSyntheticEOContact(p,
			own.Lat, own.Lon, own.AltitudeMSL, own.Heading,
			tgt.Lat, tgt.Lon, tgt.AltitudeMSL,
		)
		out = append(out, SyntheticEOContact{
			TargetDroneID: id,
			NormX:         nx,
			NormY:         ny,
			Visible:       vis,
			DeltaMslM:     dMsl,
			SlantRangeM:   slant,
		})
	}
	return out
}
