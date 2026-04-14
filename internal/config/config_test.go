package config

import (
	"testing"
)

func TestLoad_defaults(t *testing.T) {
	t.Setenv("C2_TOPOLOGY_MODE", "")
	t.Setenv("C2_EXPECTED_LATENCY_MS", "")
	cfg := Load()
	if cfg.Mode != "forward" {
		t.Fatalf("Mode %q", cfg.Mode)
	}
	if cfg.ExpectedLatencyMs != 50 {
		t.Fatalf("ExpectedLatencyMs %d", cfg.ExpectedLatencyMs)
	}
	if cfg.FreshnessThresholdMs != 2000 || cfg.MaxDroneCount != 5 {
		t.Fatalf("unexpected defaults: %+v", cfg)
	}
}

func TestLoad_envOverrides(t *testing.T) {
	t.Setenv("C2_TOPOLOGY_MODE", "relay")
	t.Setenv("C2_EXPECTED_LATENCY_MS", "200")
	t.Setenv("C2_FRESHNESS_THRESHOLD_MS", "5000")
	t.Setenv("C2_MAX_DRONE_COUNT", "12")
	cfg := Load()
	if cfg.Mode != "relay" || cfg.ExpectedLatencyMs != 200 {
		t.Fatalf("got %+v", cfg)
	}
	if cfg.FreshnessThresholdMs != 5000 || cfg.MaxDroneCount != 12 {
		t.Fatalf("got %+v", cfg)
	}
}

func TestLoad_invalidIntFallsBack(t *testing.T) {
	t.Setenv("C2_EXPECTED_LATENCY_MS", "not-a-number")
	cfg := Load()
	if cfg.ExpectedLatencyMs != 50 {
		t.Fatalf("want fallback 50, got %d", cfg.ExpectedLatencyMs)
	}
}
