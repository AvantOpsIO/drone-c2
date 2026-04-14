package config

import (
	"os"
	"strconv"
)

// DeploymentTopology describes the network topology between the C2 station and
// the drones. "forward" = operator co-located with GCS; "relay" = operator
// connected through a satellite or mesh relay, which adds latency and changes
// the freshness threshold the UI uses to mark data as stale.
type DeploymentTopology struct {
	Mode                 string `json:"mode"`
	ExpectedLatencyMs    int    `json:"expectedLatencyMs"`
	FreshnessThresholdMs int    `json:"freshnessThresholdMs"`
	MaxDroneCount        int    `json:"maxDroneCount"`
}

func Load() DeploymentTopology {
	return DeploymentTopology{
		Mode:                 envStr("C2_TOPOLOGY_MODE", "forward"),
		ExpectedLatencyMs:    envInt("C2_EXPECTED_LATENCY_MS", 50),
		FreshnessThresholdMs: envInt("C2_FRESHNESS_THRESHOLD_MS", 2000),
		MaxDroneCount:        envInt("C2_MAX_DRONE_COUNT", 5),
	}
}

func envStr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}
