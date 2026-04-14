package telemetry

import (
	"encoding/json"
	"testing"
	"time"
)

func TestTelemetryMessage_JSONRoundTrip(t *testing.T) {
	ts := time.Date(2026, 4, 1, 12, 0, 0, 0, time.UTC)
	in := TelemetryMessage{
		DroneID:       "drone-1",
		Timestamp:     ts,
		SequenceNum:   42,
		Lat:           32.5,
		Lon:           -114.4,
		FlightMode:    "GUIDED",
		Armed:         true,
		GPSFixType:    "3D_FIX",
		BoundingBoxes: []BoundingBox{{TrackID: "t1", Label: "vehicle", Confidence: 0.9, X: 0.1, Y: 0.2, W: 0.3, H: 0.4}},
		SyntheticEOContacts: []SyntheticEOContact{
			{TargetDroneID: "drone-2", NormX: 0.6, NormY: 0.4, Visible: true, DeltaMslM: 50, SlantRangeM: 1500},
		},
	}
	data, err := json.Marshal(&in)
	if err != nil {
		t.Fatal(err)
	}
	var out TelemetryMessage
	if err := json.Unmarshal(data, &out); err != nil {
		t.Fatal(err)
	}
	if out.DroneID != in.DroneID || out.SequenceNum != in.SequenceNum || out.FlightMode != in.FlightMode {
		t.Fatalf("got %+v", out)
	}
	if len(out.BoundingBoxes) != 1 || out.BoundingBoxes[0].TrackID != "t1" {
		t.Fatalf("boxes %+v", out.BoundingBoxes)
	}
	if len(out.SyntheticEOContacts) != 1 || !out.SyntheticEOContacts[0].Visible {
		t.Fatalf("eo contacts %+v", out.SyntheticEOContacts)
	}
	if out.SyntheticEOContacts[0].DeltaMslM != 50 || out.SyntheticEOContacts[0].SlantRangeM != 1500 {
		t.Fatalf("eo geometry %+v", out.SyntheticEOContacts[0])
	}
}
