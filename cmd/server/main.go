package main

import (
	"context"
	"embed"
	"encoding/json"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/avant-ops/drone-c2/internal/config"
	"github.com/avant-ops/drone-c2/internal/telemetry"
	"github.com/avant-ops/drone-c2/internal/video"
)

//go:embed all:static
var staticFS embed.FS

var startTime = time.Now()

func main() {
	level := parseLogLevel(os.Getenv("C2_LOG_LEVEL"))
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: level})))

	cfg := config.Load()
	slog.Info("topology loaded", "mode", cfg.Mode, "latency_ms", cfg.ExpectedLatencyMs, "log_level", level.String())

	hub := telemetry.NewHub()

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	go hub.Run(ctx)
	telemetry.StartGenerators(ctx, hub)

	mux := http.NewServeMux()

	mux.HandleFunc("GET /ws", hub.HandleWebSocket)

	mux.HandleFunc("GET /video/wide", func(w http.ResponseWriter, r *http.Request) {
		video.StreamMJPEG(w, r, hub)
	})

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	mux.HandleFunc("GET /ready", func(w http.ResponseWriter, r *http.Request) {
		clients := hub.ClientCount()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"status":    "ready",
			"clients":   clients,
			"uptime_s":  int(time.Since(startTime).Seconds()),
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
		json.NewEncoder(w).Encode(registry)
	})

	mux.HandleFunc("GET /api/config", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(cfg)
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
		json.NewEncoder(w).Encode(map[string]string{"status": "accepted"})
	})

	staticContent, err := fs.Sub(staticFS, "static")
	if err != nil {
		slog.Error("failed to create sub filesystem", "error", err)
		os.Exit(1)
	}
	fileServer := http.FileServer(http.FS(staticContent))
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if path == "/" {
			path = "/index.html"
		}
		if _, err := fs.Stat(staticContent, path[1:]); err != nil {
			r.URL.Path = "/"
		}
		// WHY no-store on shell + bundles: after `npm run build` + `go build`, operators
		// otherwise keep a cached index.html pointing at old hashed JS — symptoms look
		// like "stuck on ACK TIMEOUT" when the UI was actually replaced long ago.
		p := r.URL.Path
		if p == "/" {
			p = "/index.html"
		}
		if strings.HasSuffix(p, ".html") || strings.HasSuffix(p, ".js") || strings.HasSuffix(p, ".css") {
			w.Header().Set("Cache-Control", "no-store, must-revalidate")
		}
		fileServer.ServeHTTP(w, r)
	})

	handler := addSecurityHeaders(addRequestLogging(mux))

	addr := ":8080"
	if p := os.Getenv("PORT"); p != "" {
		addr = ":" + p
	}

	srv := &http.Server{
		Addr:         addr,
		Handler:      handler,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 0,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		slog.Info("server_starting", "addr", addr)
		if err := srv.ListenAndServe(); err != http.ErrServerClosed {
			slog.Error("server_error", "error", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	slog.Info("server_shutdown_start")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("server_shutdown_error", "error", err)
	}
	slog.Info("server_shutdown_complete", "uptime_s", int(time.Since(startTime).Seconds()))
}

func parseLogLevel(s string) slog.Level {
	switch strings.ToUpper(strings.TrimSpace(s)) {
	case "DEBUG":
		return slog.LevelDebug
	case "WARN", "WARNING":
		return slog.LevelWarn
	case "ERROR":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func addRequestLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Skip long-lived streams — they log lifecycle events separately.
		if r.URL.Path == "/ws" || r.URL.Path == "/video/wide" {
			next.ServeHTTP(w, r)
			return
		}

		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: 200}
		next.ServeHTTP(rec, r)
		duration := time.Since(start)

		logFn := slog.Info
		if rec.status >= 500 {
			logFn = slog.Error
		} else if rec.status >= 400 {
			logFn = slog.Warn
		}
		logFn("http_request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", rec.status,
			"duration_ms", duration.Milliseconds(),
			"remote", r.RemoteAddr,
		)
	})
}

func addSecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cross-Origin-Opener-Policy", "same-origin")
		w.Header().Set("Cross-Origin-Embedder-Policy", "credentialless")
		next.ServeHTTP(w, r)
	})
}
