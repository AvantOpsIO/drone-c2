#!/usr/bin/env bash
# Phase-A synthetic H.264 RTP stream for C2 integration tests.
# Multicast 239.255.42.${DRONE_INDEX:-1}:5600 — subscribe from c2-client with matching udpsrc.
set -euo pipefail

IDX="${DRONE_INDEX:-1}"
MCAST="239.255.42.${IDX}"
PORT="${VIDEO_UDP_PORT:-5600}"
TTL="${VIDEO_UDP_TTL:-1}"

echo "[video] RTP/H.264 test pattern -> udp://${MCAST}:${PORT} ttl=${TTL}"

run_x264() {
  exec gst-launch-1.0 -v \
    videotestsrc is-live=true pattern=ball \
    ! "video/x-raw,width=640,height=480,framerate=30/1" \
    ! videoconvert \
    ! x264enc tune=zerolatency speed-preset=ultrafast bitrate=2000 key-int-max=30 \
    ! "video/x-h264,profile=baseline" \
    ! rtph264pay config-interval=1 pt=96 \
    ! "application/x-rtp,media=video,encoding-name=H264,payload=96" \
    ! udpsink host="${MCAST}" port="${PORT}" auto-multicast=true ttl-mc="${TTL}" sync=false async=false
}

if gst-inspect-1.0 nvh264enc &>/dev/null; then
  exec gst-launch-1.0 -v \
    videotestsrc is-live=true pattern=ball \
    ! "video/x-raw,width=640,height=480,framerate=30/1" \
    ! videoconvert \
    ! nvh264enc bitrate=2000 \
    ! "video/x-h264,profile=baseline" \
    ! rtph264pay config-interval=1 pt=96 \
    ! "application/x-rtp,media=video,encoding-name=H264,payload=96" \
    ! udpsink host="${MCAST}" port="${PORT}" auto-multicast=true ttl-mc="${TTL}" sync=false async=false
fi

if gst-inspect-1.0 vaapih264enc &>/dev/null; then
  exec gst-launch-1.0 -v \
    videotestsrc is-live=true pattern=ball \
    ! "video/x-raw,width=640,height=480,framerate=30/1" \
    ! videoconvert \
    ! vaapih264enc bitrate=2000 \
    ! "video/x-h264,profile=baseline" \
    ! rtph264pay config-interval=1 pt=96 \
    ! "application/x-rtp,media=video,encoding-name=H264,payload=96" \
    ! udpsink host="${MCAST}" port="${PORT}" auto-multicast=true ttl-mc="${TTL}" sync=false async=false
fi

run_x264
