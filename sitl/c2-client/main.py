#!/usr/bin/env python3
"""Minimal companion: MAVLink HEARTBEAT per drone host; optional GStreamer RTP receive demo."""
from __future__ import annotations

import os
import re
import subprocess
import sys
import time

try:
    from pymavlink import mavutil
except ImportError:
    print("c2-client: install pymavlink", file=sys.stderr)
    sys.exit(1)


def drone_index(host: str) -> int:
    m = re.search(r"_(\d+)$", host.strip())
    if m:
        return int(m.group(1))
    m2 = re.search(r"(\d+)$", host.strip())
    if m2:
        return int(m2.group(1))
    return 1


def main() -> None:
    raw = os.environ.get("DRONE_HOSTS", "drone_1")
    hosts = [h.strip() for h in raw.split(",") if h.strip()]
    mport = int(os.environ.get("MAVLINK_PORT", "14550"))
    video_port = int(os.environ.get("VIDEO_PORT", "5600"))
    run_video = os.environ.get("RUN_VIDEO_DEMO", "0") == "1"

    print(f"[c2] hosts={hosts} mavlink_port={mport}")

    for h in hosts:
        print(f"[c2] MAVLink udp:{h}:{mport} …")
        m = mavutil.mavlink_connection(f"udpout:{h}:{mport}", source_system=254)
        m.wait_heartbeat(timeout=45)
        print(
            f"[c2] heartbeat ok host={h} target_system={m.target_system} "
            f"target_component={m.target_component}"
        )

    if run_video:
        for h in hosts:
            idx = drone_index(h)
            mcast = f"239.255.42.{idx}"
            print(f"[c2] video demo (5s) udp://{mcast}:{video_port} …")
            cmd = [
                "gst-launch-1.0",
                "-q",
                f"udpsrc",
                f"address={mcast}",
                f"port={video_port}",
                "caps=application/x-rtp,media=(string)video,clock-rate=(int)90000,encoding-name=(string)H264",
                "!",
                "rtpjitterbuffer",
                "!",
                "rtph264depay",
                "!",
                "decodebin",
                "!",
                "fakesink",
            ]
            try:
                subprocess.run(cmd, timeout=15, check=False)
            except FileNotFoundError:
                print("[c2] gst-launch-1.0 not found; skip video demo", file=sys.stderr)
                break
            except subprocess.TimeoutExpired:
                pass
            time.sleep(1)

    if os.environ.get("C2_EXIT_AFTER_CHECK") == "1":
        print("[c2] C2_EXIT_AFTER_CHECK=1 — exiting.")
        return

    print("[c2] idle (container stays up). Set RUN_VIDEO_DEMO=1 to exercise RTP on start.")
    while True:
        time.sleep(3600)


if __name__ == "__main__":
    main()
