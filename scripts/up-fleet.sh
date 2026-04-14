#!/usr/bin/env bash
# Start N named drone containers on drones_net with DRONE_INDEX=1..N.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

N="${1:-3}"
if ! [[ "$N" =~ ^[0-9]+$ ]] || [ "$N" -lt 1 ]; then
  echo "usage: $0 <count>" >&2
  exit 1
fi

echo "[up-fleet] building images (first run can take an hour+)…"
docker compose -f docker-compose.yml build drone

for i in $(seq 1 "$N"); do
  name="drone_${i}"
  if docker ps -a --format '{{.Names}}' | grep -qx "$name"; then
    echo "[up-fleet] removing existing $name"
    docker rm -f "$name" >/dev/null
  fi
  echo "[up-fleet] starting $name (DRONE_INDEX=$i)"
  docker compose -f docker-compose.yml run -d \
    --name "$name" \
    -e "DRONE_INDEX=${i}" \
    drone
done

echo "[up-fleet] done. MAVLink (per drone): udp://drone_i:14550"
echo "[up-fleet] Video RTP (multicast per index): udp://239.255.42.i:5600"
