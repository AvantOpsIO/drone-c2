#!/usr/bin/env python3
"""Verify PX4 is emitting MAVLink (HEARTBEAT) on the GCS UDP port."""
import os
import sys

try:
    from pymavlink import mavutil
except ImportError:
    print("healthcheck: pymavlink missing", file=sys.stderr)
    sys.exit(1)

port = int(os.environ.get("MAVLINK_HEALTH_PORT", "14550"))
timeout = float(os.environ.get("MAVLINK_HEALTH_TIMEOUT_S", "10"))

# udpout: PX4 binds :14550; we originate packets so the autopilot learns our address.
m = mavutil.mavlink_connection(f"udpout:127.0.0.1:{port}", source_system=255)
m.wait_heartbeat(timeout=timeout)
print("healthcheck: heartbeat ok sys=", m.target_system, "comp=", m.target_component)
sys.exit(0)
