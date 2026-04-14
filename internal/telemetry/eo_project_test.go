package telemetry

import (
	"math"
	"testing"
)

func TestProjectSyntheticEOContact_SlightlyEastOfNorthHeadingNorth(t *testing.T) {
	p := DefaultSyntheticEOParams()
	// Own heading north (0°). Target ~800m away at ~12° east of north (inside half-HFOV ~27.5°).
	lat := 32.5
	lon := -114.4
	mplon := metersPerDegreeLonEO(lat)
	brg := 12.0 * math.Pi / 180
	rng := 800.0
	dNorth := rng * math.Cos(brg)
	dEast := rng * math.Sin(brg)
	tLat := lat + dNorth/metersPerDegreeLatEO
	tLon := lon + dEast/mplon
	nx, _, vis, _, _ := ProjectSyntheticEOContact(p, lat, lon, 300, 0, tLat, tLon, 300)
	if !vis {
		t.Fatal("expected visible inside horizontal FOV")
	}
	if nx <= 0.5 {
		t.Fatalf("target right of nose should be right of center, normX=%v", nx)
	}
}

func TestProjectSyntheticEOContact_DueEastHeadingEast(t *testing.T) {
	p := DefaultSyntheticEOParams()
	lat := 32.5
	lon := -114.4
	mplon := metersPerDegreeLonEO(lat)
	dLon := 500 / mplon
	// Heading 90° = east, target still due east = straight ahead.
	nx, ny, vis, _, _ := ProjectSyntheticEOContact(p, lat, lon, 300, 90, lat, lon+dLon, 300)
	if !vis {
		t.Fatal("expected visible straight ahead")
	}
	if math.Abs(nx-0.5) > 0.05 {
		t.Fatalf("dead ahead normX want ~0.5 got %v", nx)
	}
	// Level target + fixed depression: horizon sits above frame center (normY < 0.5).
	if ny >= 0.5 {
		t.Fatalf("level target with depression want normY below center, got %v", ny)
	}
}

func TestProjectSyntheticEOContact_BehindNotVisible(t *testing.T) {
	p := DefaultSyntheticEOParams()
	lat := 32.5
	lon := -114.4
	mplon := metersPerDegreeLonEO(lat)
	dLon := -800 / mplon // west of own
	_, _, vis, dMsl, slant := ProjectSyntheticEOContact(p, lat, lon, 300, 0, lat, lon+dLon, 300)
	if dMsl != 0 || slant < 100 {
		t.Fatalf("want nonzero slant behind camera got dMsl=%v slant=%v", dMsl, slant)
	}
	if vis {
		t.Fatal("target behind should be culled")
	}
}

func TestProjectSyntheticEOContact_AltitudeAboveHorizon(t *testing.T) {
	p := DefaultSyntheticEOParams()
	lat := 32.5
	lon := -114.4
	mplon := metersPerDegreeLonEO(lat)
	dLon := 1200 / mplon
	// Ahead, shallow climb angle so still inside vertical FOV.
	_, nyHi, vis, _, _ := ProjectSyntheticEOContact(p, lat, lon, 200, 90, lat, lon+dLon, 280)
	if !vis {
		t.Fatal("expected visible")
	}
	_, nyLo, vis2, _, _ := ProjectSyntheticEOContact(p, lat, lon, 200, 90, lat, lon+dLon, 200)
	if !vis2 {
		t.Fatal("expected co-alt visible")
	}
	if nyHi >= nyLo {
		t.Fatalf("higher target should be higher in frame (smaller normY): hi=%v lo=%v", nyHi, nyLo)
	}
}

func TestBuildSyntheticEOContacts_OrderAndMissing(t *testing.T) {
	p := DefaultSyntheticEOParams()
	own := TelemetryMessage{
		DroneID: "drone-1", Lat: 32.5, Lon: -114.4, AltitudeMSL: 300, Heading: 0,
	}
	world := map[string]TelemetryMessage{
		"drone-1": own,
		"drone-2": {DroneID: "drone-2", Lat: 32.51, Lon: -114.4, AltitudeMSL: 300, Heading: 0},
	}
	contacts := BuildSyntheticEOContacts(own, world, p)
	if len(contacts) != 4 {
		t.Fatalf("want 4 others got %d", len(contacts))
	}
	if contacts[0].TargetDroneID != "drone-2" {
		t.Fatalf("order want drone-2 first got %s", contacts[0].TargetDroneID)
	}
}
