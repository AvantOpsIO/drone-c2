package main

import (
	"encoding/json"
	"io/fs"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/avant-ops/drone-c2/internal/config"
	"github.com/avant-ops/drone-c2/internal/telemetry"
	"github.com/avant-ops/drone-c2/internal/video"
)

// registerRoutes wires HTTP handlers (used by main and tests).
func registerRoutes(mux *http.ServeMux, hub *telemetry.Hub, cfg config.DeploymentTopology, staticContent fs.FS, serverStart time.Time) {
	mux.HandleFunc("GET /ws", hub.HandleWebSocket)

	mux.HandleFunc("GET /video/wide", func(w http.ResponseWriter, r *http.Request) {
		video.StreamMJPEG(w, r, hub)
	})

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	mux.HandleFunc("GET /ready", func(w http.ResponseWriter, r *http.Request) {
		clients := hub.ClientCount()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"status":    "ready",
			"clients":   clients,
			"uptime_s":  int(time.Since(serverStart).Seconds()),
			"drones":    5,
		})
	})

	mux.HandleFunc("GET /api/drones", func(w http.ResponseWriter, r *http.Request) {
		type droneInfo struct {
			ID       string `json:"id"`
			Callsign string `json:"callsign"`
		}
		registry := []droneInfo{
			{"drone-1", "ALPHA-1"},
			{"drone-2", "BRAVO-2"},
			{"drone-3", "CHARLIE-3"},
			{"drone-4", "DELTA-4"},
			{"drone-5", "ECHO-5"},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(registry)
	})

	mux.HandleFunc("GET /api/config", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(cfg)
	})

	mux.HandleFunc("POST /api/command", func(w http.ResponseWriter, r *http.Request) {
		var cmd struct {
			DroneID string  `json:"droneId"`
			Type    string  `json:"type"`
			Lat     float64 `json:"lat,omitempty"`
			Lon     float64 `json:"lon,omitempty"`
			Mode    string  `json:"mode,omitempty"`
		}
		if err := json.NewDecoder(r.Body).Decode(&cmd); err != nil {
			slog.Warn("command_decode_error", "error", err, "remote", r.RemoteAddr)
			http.Error(w, "invalid command", http.StatusBadRequest)
			return
		}
		slog.Info("command_received", "drone", cmd.DroneID, "type", cmd.Type,
			"lat", cmd.Lat, "lon", cmd.Lon, "mode", cmd.Mode)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "accepted"})
	})

	fileServer := http.FileServer(http.FS(staticContent))
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if path == "/" {
			path = "/index.html"
		}
		if _, err := fs.Stat(staticContent, path[1:]); err != nil {
			r.URL.Path = "/"
		}
		p := r.URL.Path
		if p == "/" {
			p = "/index.html"
		}
		if strings.HasSuffix(p, ".html") || strings.HasSuffix(p, ".js") || strings.HasSuffix(p, ".css") {
			w.Header().Set("Cache-Control", "no-store, must-revalidate")
		}
		fileServer.ServeHTTP(w, r)
	})
}
