package telemetry

import (
	"context"
	"encoding/json"
	"testing"
	"time"
)

func TestApplySyntheticEOContacts_MergesOwnAndPriorWorld(t *testing.T) {
	prior := map[string]TelemetryMessage{
		"drone-2": {DroneID: "drone-2", Lat: 32.51, Lon: -114.4, AltitudeMSL: 310, Heading: 0},
	}
	msg := TelemetryMessage{
		DroneID: "drone-1", Lat: 32.5, Lon: -114.4, AltitudeMSL: 300, Heading: 0,
	}
	ApplySyntheticEOContacts(&msg, prior)
	if len(msg.SyntheticEOContacts) != 4 {
		t.Fatalf("want 4 other drones, got %d", len(msg.SyntheticEOContacts))
	}
	var saw2 bool
	for _, c := range msg.SyntheticEOContacts {
		if c.TargetDroneID == "drone-2" {
			saw2 = true
			if c.SlantRangeM < 100 || c.SlantRangeM > 5000 {
				t.Fatalf("unexpected slant %v", c.SlantRangeM)
			}
		}
	}
	if !saw2 {
		t.Fatal("missing drone-2 contact")
	}
}

func TestApplySyntheticEOContacts_EmptyPriorStillFourSlots(t *testing.T) {
	msg := TelemetryMessage{
		DroneID: "drone-1", Lat: 32.5, Lon: -114.4, AltitudeMSL: 300, Heading: 0,
	}
	ApplySyntheticEOContacts(&msg, nil)
	if len(msg.SyntheticEOContacts) != 4 {
		t.Fatalf("want 4 slots, got %d", len(msg.SyntheticEOContacts))
	}
	for _, c := range msg.SyntheticEOContacts {
		if c.TargetDroneID == "" {
			t.Fatal("empty target id")
		}
	}
}

func TestApplySyntheticEOContacts_JSONRoundTrip(t *testing.T) {
	msg := TelemetryMessage{
		DroneID: "drone-1", Lat: 32.5, Lon: -114.4, AltitudeMSL: 300, Heading: 45,
		Timestamp: time.Now(),
	}
	ApplySyntheticEOContacts(&msg, map[string]TelemetryMessage{
		"drone-2": {DroneID: "drone-2", Lat: 32.52, Lon: -114.38, AltitudeMSL: 305, Heading: 0},
	})
	data, err := json.Marshal(&msg)
	if err != nil {
		t.Fatal(err)
	}
	var out TelemetryMessage
	if err := json.Unmarshal(data, &out); err != nil {
		t.Fatal(err)
	}
	if len(out.SyntheticEOContacts) != len(msg.SyntheticEOContacts) {
		t.Fatalf("contacts len %d vs %d", len(out.SyntheticEOContacts), len(msg.SyntheticEOContacts))
	}
}

func TestHub_RunStoresPositionAfterIncoming(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	h := NewHub()
	go h.Run(ctx)

	msg := TelemetryMessage{
		DroneID: "drone-1", Lat: 32.501, Lon: -114.401, AltitudeMSL: 299, Heading: 12,
	}
	select {
	case h.Incoming() <- msg:
	case <-time.After(time.Second):
		t.Fatal("blocked on incoming")
	}

	deadline := time.Now().Add(500 * time.Millisecond)
	for time.Now().Before(deadline) {
		p := h.LatestPositions()
		if got, ok := p["drone-1"]; ok && got.Lat == msg.Lat && len(got.SyntheticEOContacts) == 4 {
			return
		}
		time.Sleep(2 * time.Millisecond)
	}
	t.Fatal("position or synthetic contacts not updated")
}
