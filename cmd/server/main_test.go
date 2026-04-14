package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/coder/websocket"
	"github.com/avant-ops/drone-c2/internal/config"
	"github.com/avant-ops/drone-c2/internal/telemetry"
)

func testStaticFS() fstest.MapFS {
	return fstest.MapFS{
		"index.html": &fstest.MapFile{Data: []byte("<!doctype html><html></html>")},
	}
}

func TestGET_health(t *testing.T) {
	hub := telemetry.NewHub()
	mux := http.NewServeMux()
	registerRoutes(mux, hub, config.Load(), testStaticFS(), time.Now())
	srv := httptest.NewServer(addSecurityHeaders(mux))
	defer srv.Close()

	res, err := http.Get(srv.URL + "/health")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status %d", res.StatusCode)
	}
	var body map[string]string
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body["status"] != "ok" {
		t.Fatalf("body %+v", body)
	}
}

func TestGET_ready(t *testing.T) {
	hub := telemetry.NewHub()
	mux := http.NewServeMux()
	registerRoutes(mux, hub, config.Load(), testStaticFS(), time.Now())
	srv := httptest.NewServer(addSecurityHeaders(mux))
	defer srv.Close()

	res, err := http.Get(srv.URL + "/ready")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status %d", res.StatusCode)
	}
	var body map[string]any
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body["status"] != "ready" {
		t.Fatalf("body %+v", body)
	}
}

func TestWebSocket_receivesTelemetryWithSyntheticEO(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	hub := telemetry.NewHub()
	go hub.Run(ctx)

	mux := http.NewServeMux()
	registerRoutes(mux, hub, config.Load(), testStaticFS(), time.Now())
	srv := httptest.NewServer(addSecurityHeaders(mux))
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws"
	dialCtx, dialCancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer dialCancel()
	conn, _, err := websocket.Dial(dialCtx, wsURL, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "")

	msg := telemetry.TelemetryMessage{
		DroneID:        "drone-1",
		Lat:            32.5,
		Lon:            -114.4,
		AltitudeMSL:    300,
		AltitudeAGL:    235,
		GroundSpeed:    12,
		Heading:        45,
		FlightMode:     "GUIDED",
		GPSFixType:     "3D_FIX",
		Armed:          false,
		LinkQuality:    90,
		SatelliteCount: 12,
	}
	select {
	case hub.Incoming() <- msg:
	case <-time.After(time.Second):
		t.Fatal("incoming full")
	}

	readCtx, readCancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer readCancel()
	_, data, err := conn.Read(readCtx)
	if err != nil {
		t.Fatal(err)
	}
	var out telemetry.TelemetryMessage
	if err := json.Unmarshal(data, &out); err != nil {
		t.Fatal(err)
	}
	if out.DroneID != "drone-1" {
		t.Fatalf("drone %q", out.DroneID)
	}
	if len(out.SyntheticEOContacts) != 4 {
		t.Fatalf("want 4 synthetic contacts, got %d", len(out.SyntheticEOContacts))
	}
}
