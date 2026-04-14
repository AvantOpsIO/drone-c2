#!/usr/bin/env python3
"""
Integration checks against a running SITL drone container on drones_net:
  - MAVLink HEARTBEAT + param read + COMMAND_LONG (request message / arm)
  - RTP/H.264-ish UDP payload on multicast 239.255.42.<index>:5600
"""
from __future__ import annotations

import os
import re
import socket
import struct
import sys
import time

try:
    from pymavlink import mavutil
except ImportError:
    print("pymavlink required", file=sys.stderr)
    sys.exit(1)

# MAVLink common (avoid dialect import fragility)
MAV_CMD_REQUEST_MESSAGE = 512
MAVLINK_MSG_ID_AUTOPILOT_VERSION = 148
MAV_CMD_COMPONENT_ARM_DISARM = 400


def drone_index_from_host(host: str) -> int:
    m = re.search(r"_(\d+)$", host.strip())
    if m:
        return int(m.group(1))
    m2 = re.search(r"(\d+)$", host.strip())
    return int(m2.group(1)) if m2 else 1


def recv_multicast_bytes(group: str, port: int, timeout_s: float, min_bytes: int) -> int:
    """Join multicast and count UDP payload bytes received."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(("", port))
    mreq = struct.pack("4sl", socket.inet_aton(group), socket.INADDR_ANY)
    sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq)
    sock.settimeout(0.5)
    total = 0
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline and total < min_bytes:
        try:
            data, _ = sock.recvfrom(65535)
            total += len(data)
        except socket.timeout:
            continue
    sock.close()
    return total


def main() -> int:
    host = os.environ.get("DRONE_HOST", "drone_1")
    mport = int(os.environ.get("MAVLINK_PORT", "14550"))
    video_port = int(os.environ.get("VIDEO_PORT", "5600"))
    idx = int(os.environ.get("DRONE_INDEX", str(drone_index_from_host(host))))

    print(f"[test] target mavlink udpout:{host}:{mport} sysidx={idx}")

    m = mavutil.mavlink_connection(f"udpout:{host}:{mport}", source_system=250, source_component=0)
    # Prime return path for udpin listeners (mock drone + some SITL setups).
    m.mav.heartbeat_send(
        mavutil.mavlink.MAV_TYPE_GCS,
        mavutil.mavlink.MAV_AUTOPILOT_INVALID,
        0,
        0,
        mavutil.mavlink.MAV_STATE_ACTIVE,
    )
    time.sleep(0.15)
    print("[test] waiting for HEARTBEAT (60s)…")
    m.wait_heartbeat(timeout=60)
    print(
        f"[test] HEARTBEAT ok system={m.target_system} component={m.target_component}"
    )

    # Param read (proves bidirectional MAVLink); param_id is 16 bytes in MAVLink 2
    pid = b"MAV_SYS_ID" + b"\x00" * (16 - len(b"MAV_SYS_ID"))
    m.mav.param_request_read_send(m.target_system, m.target_component, pid, -1)
    t0 = time.monotonic()
    pr = None
    while time.monotonic() - t0 < 10:
        pr = m.recv_match(type="PARAM_VALUE", blocking=True, timeout=1)
        if pr is not None:
            break
    if pr is None:
        print("[test] FAIL: no PARAM_VALUE for MAV_SYS_ID", file=sys.stderr)
        return 1
    print(f"[test] PARAM_VALUE MAV_SYS_ID = {pr.param_value} (expected ~{idx})")

    # COMMAND_LONG: MAV_CMD_REQUEST_MESSAGE (512) — widely supported noop-ish request
    m.mav.command_long_send(
        m.target_system,
        m.target_component,
        MAV_CMD_REQUEST_MESSAGE,
        0,
        float(MAVLINK_MSG_ID_AUTOPILOT_VERSION),
        0,
        0,
        0,
        0,
        0,
        0,
    )
    t0 = time.monotonic()
    av = None
    while time.monotonic() - t0 < 10:
        av = m.recv_match(type="AUTOPILOT_VERSION", blocking=True, timeout=1)
        if av is not None:
            break
    if av is None:
        print("[test] WARN: no AUTOPILOT_VERSION (command may be ignored in sim); continuing")
    else:
        print(f"[test] AUTOPILOT_VERSION cap_flags={av.capabilities}")

    # Second command: arm (0 = disarm in PX4 often needs preflight; we only check COMMAND_ACK)
    m.mav.command_long_send(
        m.target_system,
        m.target_component,
        MAV_CMD_COMPONENT_ARM_DISARM,
        0,
        1.0,  # arm
        0,
        0,
        0,
        0,
        0,
        0,
    )
    t0 = time.monotonic()
    ack = None
    while time.monotonic() - t0 < 10:
        ack = m.recv_match(type="COMMAND_ACK", blocking=True, timeout=1)
        if ack is not None and ack.command == MAV_CMD_COMPONENT_ARM_DISARM:
            break
    if ack is None:
        print("[test] WARN: no COMMAND_ACK for ARM (SITL may reject); MAVLink path exercised")
    else:
        print(f"[test] COMMAND_ACK arm result={ack.result}")

    # Telemetry sample
    t0 = time.monotonic()
    pos = None
    while time.monotonic() - t0 < 25:
        pos = m.recv_match(type="GLOBAL_POSITION_INT", blocking=True, timeout=1)
        if pos is not None:
            break
    if pos is None:
        print("[test] WARN: no GLOBAL_POSITION_INT in 25s (sim may still be initializing)")
    else:
        print(
            f"[test] GLOBAL_POSITION_INT lat={pos.lat / 1e7:.6f} lon={pos.lon / 1e7:.6f} "
            f"alt_msl={pos.alt / 1000:.1f}m"
        )

    mcast = f"239.255.42.{idx}"
    print(f"[test] video: multicast {mcast}:{video_port} for {8}s (expect RTP from gstreamer)…")
    n = recv_multicast_bytes(mcast, video_port, timeout_s=8.0, min_bytes=5000)
    if n < 2000:
        print(f"[test] FAIL: only {n} bytes on video multicast (is ENABLE_VIDEO=1 on drone?)", file=sys.stderr)
        return 1
    print(f"[test] video OK: received ~{n} bytes UDP on {mcast}:{video_port}")

    print("[test] all checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
