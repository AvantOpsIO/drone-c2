package telemetry

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"math/rand"
	"time"
)

// droneSpec defines a drone's initial state and callsign. Starting positions
// are spread across the Yuma Proving Ground area (~32.5°N, 114.4°W) — a real
// DoD test range, chosen because it's public knowledge and has appropriate
// terrain for a UAV demo.
type droneSpec struct {
	id       string
	callsign string
	lat      float64
	lon      float64
}

var drones = []droneSpec{
	{"drone-1", "ALPHA-1", 32.500, -114.400},
	{"drone-2", "BRAVO-2", 32.510, -114.385},
	{"drone-3", "CHARLIE-3", 32.495, -114.415},
	{"drone-4", "DELTA-4", 32.515, -114.395},
	{"drone-5", "ECHO-5", 32.505, -114.425},
}

// metersPerDegreeLat is a rough constant for latitude at ~32°N.
// Good enough for a demo flying within a few km.
const metersPerDegreeLat = 111_320.0

func metersPerDegreeLon(lat float64) float64 {
	return 111_320.0 * math.Cos(lat*math.Pi/180)
}

// StartGenerators launches one goroutine per drone. Each goroutine independently
// produces telemetry at ~10 Hz with realistic jitter and occasional link drops,
// simulating MAVLink over a lossy radio link.
func StartGenerators(ctx context.Context, hub *Hub) {
	for _, spec := range drones {
		slog.Info("generator_start", "drone", spec.id, "callsign", spec.callsign,
			"lat", spec.lat, "lon", spec.lon)
		go runDrone(ctx, spec, hub.Incoming())
	}
}

func runDrone(ctx context.Context, spec droneSpec, out chan<- TelemetryMessage) {
	defer slog.Info("generator_stop", "drone", spec.id)

	r := rand.New(rand.NewSource(time.Now().UnixNano()))

	lat := spec.lat
	lon := spec.lon
	alt := 200.0 + r.Float64()*100
	heading := r.Float64() * 360
	speed := 15.0 + r.Float64()*10
	battery := 100.0
	battVoltage := 25.2
	seq := uint32(0)

	// Target waypoint the drone is currently flying toward.
	wpLat, wpLon := randomWaypoint(r, spec.lat, spec.lon, 2000)

	flightMode := "GUIDED"
	armed := true
	modeTimer := time.Now()

	for {
		// Variable tick rate: base 100ms (10 Hz) with ±20% jitter to simulate
		// real MAVLink variability. Radio links don't deliver packets at fixed
		// intervals.
		jitter := time.Duration(80+r.Intn(40)) * time.Millisecond

		// Occasional link degradation: ~2% chance of a 200-800ms gap.
		if r.Float64() < 0.02 {
			jitter = time.Duration(200+r.Intn(600)) * time.Millisecond
		}

		select {
		case <-ctx.Done():
			return
		case <-time.After(jitter):
		}

		// Move toward waypoint.
		dlat := wpLat - lat
		dlon := wpLon - lon
		dist := math.Sqrt(dlat*dlat*metersPerDegreeLat*metersPerDegreeLat +
			dlon*dlon*metersPerDegreeLon(lat)*metersPerDegreeLon(lat))

		if dist < 50 {
			wpLat, wpLon = randomWaypoint(r, spec.lat, spec.lon, 2000)
		}

		desiredHeading := math.Atan2(dlon*metersPerDegreeLon(lat), dlat*metersPerDegreeLat) * 180 / math.Pi
		if desiredHeading < 0 {
			desiredHeading += 360
		}

		// Smooth heading changes — real aircraft don't snap to headings. Max
		// turn rate ~3°/tick gives realistic arcs.
		headingDiff := desiredHeading - heading
		if headingDiff > 180 {
			headingDiff -= 360
		}
		if headingDiff < -180 {
			headingDiff += 360
		}
		maxTurn := 3.0
		if headingDiff > maxTurn {
			headingDiff = maxTurn
		} else if headingDiff < -maxTurn {
			headingDiff = -maxTurn
		}
		// No per-tick heading jitter: it shakes body-fixed EO contacts and FLIR terrain scroll.
		heading += headingDiff
		heading = math.Mod(heading+360, 360)

		dt := 0.1 // seconds per tick at base rate
		moveDist := speed * dt
		lat += (moveDist * math.Cos(heading*math.Pi/180)) / metersPerDegreeLat
		lon += (moveDist * math.Sin(heading*math.Pi/180)) / metersPerDegreeLon(lat)

		// Altitude: gradual drift toward a target band.
		targetAlt := 200.0 + 100*math.Sin(float64(time.Now().UnixMilli())/30000.0)
		vertSpeed := (targetAlt - alt) * 0.02
		alt += vertSpeed
		if alt < 100 {
			alt = 100
		}
		if alt > 400 {
			alt = 400
		}

		// Battery drain: ~0.001%/tick → full drain in ~10000 ticks (~17 min).
		// Realistic enough for a demo session.
		battery -= 0.001 + r.Float64()*0.0005
		if battery < 5 {
			battery = 5
		}
		battVoltage = 19.0 + (battery/100)*6.2

		// RSSI and link quality fluctuate around baseline with occasional dips.
		rssi := -55 + r.Intn(20) - 10
		linkQuality := 75 + r.Intn(25)
		if r.Float64() < 0.05 {
			rssi -= 20
			linkQuality -= 30
		}
		if linkQuality < 0 {
			linkQuality = 0
		}
		if linkQuality > 100 {
			linkQuality = 100
		}

		// Flight mode cycling: start GUIDED, occasionally enter LOITER or AUTO.
		if time.Since(modeTimer) > 15*time.Second {
			switch r.Intn(10) {
			case 0:
				flightMode = "LOITER"
			case 1, 2:
				flightMode = "AUTO"
			default:
				flightMode = "GUIDED"
			}
			modeTimer = time.Now()
		}

		gpsFixType := "3D_FIX"
		satCount := 12 + r.Intn(6)
		if r.Float64() < 0.03 {
			gpsFixType = "RTK_FLOAT"
			satCount = 18 + r.Intn(4)
		}

		// Bounding boxes: ~10% of frames carry AI detections.
		var boxes []BoundingBox
		if r.Float64() < 0.10 {
			nBoxes := 1 + r.Intn(2)
			for i := 0; i < nBoxes; i++ {
				labels := []string{"VEHICLE", "PERSONNEL", "UNKNOWN"}
				boxes = append(boxes, BoundingBox{
					TrackID:    fmt.Sprintf("T%d-%d", seq, i),
					Label:      labels[r.Intn(len(labels))],
					Confidence: 0.5 + r.Float64()*0.5,
					X:          0.1 + r.Float64()*0.6,
					Y:          0.1 + r.Float64()*0.6,
					W:          0.05 + r.Float64()*0.15,
					H:          0.05 + r.Float64()*0.15,
				})
			}
		}

		seq++
		msg := TelemetryMessage{
			DroneID:              spec.id,
			Timestamp:            time.Now(),
			SequenceNum:          seq,
			Lat:                  lat,
			Lon:                  lon,
			AltitudeMSL:         alt + 65, // Yuma elevation ~65m
			AltitudeAGL:         alt,
			GroundSpeed:          speed + (r.Float64()-0.5)*0.35,
			VerticalSpeed:        vertSpeed,
			Heading:              heading,
			FlightMode:           flightMode,
			Armed:                armed,
			BatteryVoltage:       battVoltage,
			BatteryPercent:       battery,
			BatteryTimeRemaining: int(battery / 0.001 / 10),
			RSSI:                 rssi,
			LinkQuality:          linkQuality,
			GPSFixType:           gpsFixType,
			SatelliteCount:       satCount,
			CommandLatency:       30 + r.Intn(40),
			IFFMode:              "MODE_3",
			EncryptionStatus:     "ENCRYPTED",
			BoundingBoxes:        boxes,
		}

		select {
		case out <- msg:
		case <-ctx.Done():
			return
		}

		// Burst: ~5% chance of sending 2 extra messages in rapid succession.
		// Real radios sometimes batch-deliver queued packets.
		if r.Float64() < 0.05 {
			for i := 0; i < 2; i++ {
				seq++
				msg.SequenceNum = seq
				msg.Timestamp = time.Now()
				select {
				case out <- msg:
				default:
				}
			}
		}
	}
}

func randomWaypoint(r *rand.Rand, baseLat, baseLon, radiusMeters float64) (float64, float64) {
	angle := r.Float64() * 2 * math.Pi
	dist := r.Float64() * radiusMeters
	dlat := (dist * math.Cos(angle)) / metersPerDegreeLat
	dlon := (dist * math.Sin(angle)) / metersPerDegreeLon(baseLat)
	return baseLat + dlat, baseLon + dlon
}
