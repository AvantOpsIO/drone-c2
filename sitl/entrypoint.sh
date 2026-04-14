#!/usr/bin/env bash
set -euo pipefail

export DISPLAY="${DISPLAY:-:99}"
export HEADLESS="${HEADLESS:-1}"
export PX4_NO_FOLLOW_MODE="${PX4_NO_FOLLOW_MODE:-1}"
export px4_instance="${px4_instance:-0}"
export DRONE_INDEX="${DRONE_INDEX:-}"

echo "[entry] DRONE_INDEX=${DRONE_INDEX:-unset} HEADLESS=${HEADLESS} DISPLAY=${DISPLAY}"

echo "[x11] starting Xvfb on :99"
Xvfb :99 -screen 0 1280x720x24 -ac +extension GLX +render -noreset &
export DISPLAY=:99
sleep 1

VIDEO_PID=""
if [ "${ENABLE_VIDEO:-1}" = "1" ]; then
  echo "[video] gstreamer RTP/H.264 (background); DRONE_INDEX=${DRONE_INDEX:-1}"
  /usr/local/bin/rtp-udp-5600.sh &
  VIDEO_PID=$!
fi

PX4_ROOT="/px4"
BUILD="${PX4_ROOT}/build/px4_sitl_default"
PX4_BIN="${BUILD}/bin/px4"
MODEL="${GAZEBO_MODEL:-iris}"
WORLD="${GAZEBO_WORLD:-empty}"

cleanup() {
  echo "[entry] cleanup"
  if [ -n "${VIDEO_PID}" ]; then
    kill "${VIDEO_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "[sitl] px4=${PX4_BIN} model=${MODEL} world=${WORLD}"
echo "[mavlink] GCS UDP port 14550 (see px4-rc.mavlink overlay)"

set +e
bash "${PX4_ROOT}/Tools/simulation/gazebo-classic/sitl_run.sh" \
  "${PX4_BIN}" none "${MODEL}" "${WORLD}" "${PX4_ROOT}" "${BUILD}"
STATUS=$?
set -e

echo "[sitl] px4 exited status=${STATUS}"
exit "${STATUS}"
