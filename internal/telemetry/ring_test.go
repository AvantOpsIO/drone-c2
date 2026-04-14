package telemetry

import (
	"fmt"
	"testing"
)

func TestRingBuffer_snapshotOrderAndCapacity(t *testing.T) {
	r := newRingBuffer(3)
	for i := range 3 {
		r.push(TelemetryMessage{DroneID: fmt.Sprintf("d-%d", i), SequenceNum: uint32(i)})
	}
	snap := r.snapshot()
	if len(snap) != 3 {
		t.Fatalf("len %d, want 3", len(snap))
	}
	for i := range 3 {
		if snap[i].SequenceNum != uint32(i) || snap[i].DroneID != fmt.Sprintf("d-%d", i) {
			t.Fatalf("idx %d: got %+v", i, snap[i])
		}
	}
}

func TestRingBuffer_overwriteOldest(t *testing.T) {
	r := newRingBuffer(2)
	r.push(TelemetryMessage{DroneID: "a", SequenceNum: 1})
	r.push(TelemetryMessage{DroneID: "b", SequenceNum: 2})
	r.push(TelemetryMessage{DroneID: "c", SequenceNum: 3})
	snap := r.snapshot()
	if len(snap) != 2 {
		t.Fatalf("len %d, want 2", len(snap))
	}
	if snap[0].DroneID != "b" || snap[1].DroneID != "c" {
		t.Fatalf("want b,c in order, got %+v", snap)
	}
}

func TestRingBuffer_empty(t *testing.T) {
	r := newRingBuffer(5)
	if len(r.snapshot()) != 0 {
		t.Fatal("expected empty snapshot")
	}
}
