#!/usr/bin/env bash
set -euo pipefail
IDX="${DRONE_INDEX:-1}"
MCAST="239.255.42.${IDX}"
PORT="${VIDEO_UDP_PORT:-5600}"
TTL="${VIDEO_UDP_TTL:-1}"
exec gst-launch-1.0 -q \
  videotestsrc is-live=true pattern=ball \
  ! "video/x-raw,width=640,height=480,framerate=30/1" \
  ! videoconvert \
  ! x264enc tune=zerolatency speed-preset=ultrafast bitrate=2000 key-int-max=30 \
  ! "video/x-h264,profile=baseline" \
  ! rtph264pay config-interval=1 pt=96 \
  ! "application/x-rtp,media=video,encoding-name=H264,payload=96" \
  ! udpsink host="${MCAST}" port="${PORT}" auto-multicast=true ttl-mc="${TTL}" sync=false async=false
