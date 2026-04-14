# Drone C2 (demo)

Personal experiment: keep a React UI responsive when the screen and data path want to move fast, the kind of pressure you get around drones and live maps. Most of my day to day has been normal web apps on Next.js, so I wanted a small playground that still felt serious.

## Why this shape (not just a green skin)

- **Clear hot path:** WebSocket in a **worker**, numeric **SharedArrayBuffer**, **`requestAnimationFrame`** for canvases, **Zustand** for slower UI with **selective** subscriptions. That is a direct answer to keeping React off the **10–50 Hz** presentation path.
- **Tier A / B / C:** Presentation (SAB + rAF) vs throttled app state vs reference HTTP. Real split, not labels for show.
- **Go + embedded SPA:** One binary can ship the UI; dev mode still uses Vite HMR.
- **DATA LAYERS:** Draggable tier map for demos—walk tier A/B/C from ingest to UI in the running app when a demo or Q&A needs the path visible (defense/GCS-style settings are one example).

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for problem statement, **why worker + SAB**, **COOP/COEP**, and a short “real system” sketch (binary telemetry, WebRTC video, dronekit-runtime).

I went with a Go server that embeds the production Vite build, plus a dev mode where Vite runs next to Go for hot reload. Live telemetry uses a WebSocket into a worker, not the main React thread.

**Tier summary**

- **Tier A** Hot numbers and positions land in a SharedArrayBuffer from the worker. Canvases read that on `requestAnimationFrame` so React is not in the loop for every tick.
- **Tier B** Full messages and strings get throttled into Zustand for cards, strips, and anything that is fine at a slower cadence, with urgent pushes when something important changes.
- **Tier C** Reference stuff loads over HTTP with React Query so it is not fighting the live path.

A thin **perf hint** strip under the top bar states the same idea in one line; full detail is DATA LAYERS + the doc above.

**Theme:** All colors are defined once in `web/src/constants/tactical.ts` and mirrored to CSS variables (`--c2-*`) at startup so `index.css` and React stay aligned; canvas renderers still read the `COLORS` object directly.

Longer term this UI should sit in front of [dronekit-runtime](https://github.com/AvantOpsIO/dronekit-runtime) for network exposed drone services (MAVLink, video, pluggable adapters) and [gazebo-bridge](https://github.com/AvantOpsIO/gazebo-bridge) for Gazebo Sim camera output (gz-transport → GStreamer H.264 → RTSP). None of that is wired in yet; the app still uses the in repo simulator only.

This repo is a demo simulator, not a product. See [`sitl/README.md`](sitl/README.md) if you are poking at PX4 style SITL. Gazebo Classic in that path is picky on Apple Silicon; the sitl readme calls out mocks and amd64 builds.

### Run it

```bash
make dev      # Go + Vite with HMR
# or
make run      # build web, embed static, run on PORT (default 8080)
```

Then open the URL the server prints (usually `http://localhost:8080`).

Use **DATA LAYERS** in the top bar (yellow outline) to open the draggable tier A/B/C map. Check **Show region chips** inside that panel to tag the video, map, and strip. If you only run `make serve` without rebuilding, you will keep an old embedded UI: run `make run` or `make build` after pulling changes.

### Tests

```bash
go test ./...
cd web && npm test
```

Or `make test` from the repo root.
