.PHONY: help dev build clean build-field run start serve stop restart test

# Default HTTP listen port (passed to the Go binary via PORT).
PORT ?= 8080

help:
	@echo "Drone C2 — common targets"
	@echo ""
	@echo "  make build        Frontend (npm) + Go binary → bin/drone-c2"
	@echo "  make run          build, then run server in foreground (PORT=$(PORT))"
	@echo "  make start        alias for run"
	@echo "  make serve        run bin/drone-c2 without rebuilding (PORT=$(PORT))"
	@echo "  make stop         kill whatever is listening on PORT"
	@echo "  make restart      stop then run (full rebuild)"
	@echo "  make dev          Go server + Vite (hot reload frontend)"
	@echo "  make build-field  stripped single binary for airgapped deploy"
	@echo "  make clean        remove cmd/server/static/* and bin/"
	@echo "  make test         go test ./... and npm test in web/"
	@echo ""
	@echo "Examples:  PORT=3000 make run    make stop && make serve"

# Build frontend into cmd/server/static/ (go:embed), then compile.
build:
	cd web && npm install && npm run build
	go build -o bin/drone-c2 ./cmd/server

run: build
	PORT=$(PORT) ./bin/drone-c2

start: run

# Run last build without npm/go compile (faster iteration).
serve:
	PORT=$(PORT) ./bin/drone-c2

stop:
	@lsof -ti :$(PORT) | xargs kill -9 2>/dev/null || true
	@echo "Stopped listener on :$(PORT) (if any)."

restart: stop run

# Dev: Go API + static host on :8080, Vite on :5173 with proxy to Go.
dev:
	@echo "Go server on :$(PORT) (background) — Vite on http://localhost:5173"
	PORT=$(PORT) go run ./cmd/server &
	cd web && npm run dev

test:
	go test ./...
	cd web && npm test

clean:
	rm -rf cmd/server/static/* bin/
	@echo "placeholder" > cmd/server/static/.gitkeep

build-field:
	cd web && npm install && npm run build
	CGO_ENABLED=0 go build -ldflags="-s -w" -o bin/drone-c2-field ./cmd/server
