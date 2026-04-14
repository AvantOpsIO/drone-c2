#!/usr/bin/env bash
# Start a drone-like container and run MAVLink + RTP integration tests.
# USE_MOCK=1 (default): mock-drone (works on Apple Silicon). USE_MOCK=0: full PX4 image (needs linux/amd64 — see sitl/README.md).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DRONE_NAME="${DRONE_NAME:-drone_1}"
DRONE_INDEX="${DRONE_INDEX:-1}"
USE_MOCK="${USE_MOCK:-1}"
WAIT_SECS="${WAIT_SECS:-120}"

echo "[test-sitl] building sitl-integration-test…"
docker compose -f docker-compose.yml build sitl-integration-test

if [[ "${USE_MOCK}" == "1" ]]; then
  echo "[test-sitl] USE_MOCK=1 — building mock-drone (no PX4/Gazebo)…"
  docker compose -f docker-compose.yml build mock-drone
  SERVICE="mock-drone"
else
  echo "[test-sitl] USE_MOCK=0 — building drone (PX4+Gazebo; long build, prefer linux/amd64)…"
  docker compose -f docker-compose.yml build drone
  SERVICE="drone"
fi

if docker ps -a --format '{{.Names}}' | grep -qx "${DRONE_NAME}"; then
  echo "[test-sitl] removing existing ${DRONE_NAME}"
  docker rm -f "${DRONE_NAME}" >/dev/null
fi

echo "[test-sitl] starting ${DRONE_NAME} (${SERVICE}, DRONE_INDEX=${DRONE_INDEX})…"
docker compose -f docker-compose.yml run -d \
  --name "${DRONE_NAME}" \
  -e "DRONE_INDEX=${DRONE_INDEX}" \
  "${SERVICE}"

echo "[test-sitl] waiting up to ${WAIT_SECS}s for healthy…"
deadline=$(($(date +%s) + WAIT_SECS))
status="unknown"
while [ "$(date +%s)" -lt "${deadline}" ]; do
  status="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${DRONE_NAME}" 2>/dev/null || echo missing)"
  if [[ "${status}" == "healthy" ]]; then
    echo "[test-sitl] healthy"
    break
  fi
  echo "[test-sitl] health=${status} …"
  sleep 5
done

if [[ "${status}" != "healthy" ]]; then
  echo "[test-sitl] container not healthy; recent logs:" >&2
  docker logs "${DRONE_NAME}" 2>&1 | tail -60 >&2 || true
  exit 1
fi

echo "[test-sitl] running integration test…"
docker compose -f docker-compose.yml run --rm \
  -e "DRONE_HOST=${DRONE_NAME}" \
  -e "DRONE_INDEX=${DRONE_INDEX}" \
  sitl-integration-test

echo "[test-sitl] passed. Stop with: docker rm -f ${DRONE_NAME}"
