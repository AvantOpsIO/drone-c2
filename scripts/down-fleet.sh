#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

N="${1:-32}"
echo "[down-fleet] removing drone_1..drone_${N} if present…"
for i in $(seq 1 "$N"); do
  docker rm -f "drone_${i}" 2>/dev/null || true
done

docker compose -f docker-compose.yml down --remove-orphans 2>/dev/null || true
echo "[down-fleet] done."
