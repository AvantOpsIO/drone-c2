#!/usr/bin/env python3
"""
Lightweight UDP MAVLink stand-in for integration tests (no PX4/Gazebo).
Listens on 14550; replies to GCS-style udpout clients after they send any packet.
"""
from __future__ import annotations

import os
import subprocess
import time

from pymavlink import mavutil

SYSID = int(os.environ.get("DRONE_INDEX", "1"))
COMPID = 1
mav = mavutil.mavlink


def start_video() -> None:
    if os.environ.get("ENABLE_VIDEO", "1") != "1":
        return
    env = os.environ.copy()
    env.setdefault("DRONE_INDEX", str(SYSID))
    subprocess.Popen(
        ["/app/rtp-udp-5600.sh"],
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.STDOUT,
    )


def send_uav_heartbeat(m: mavutil.mavfile) -> None:
    m.mav.heartbeat_send(
        mav.MAV_TYPE_QUADROTOR,
        mav.MAV_AUTOPILOT_PX4,
        mav.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED,
        0,
        mav.MAV_STATE_STANDBY,
    )


def send_sample_global_pos(m: mavutil.mavfile) -> None:
    m.mav.global_position_int_send(
        int(time.time() * 1000) % 2**32,
        int(47.397742 * 1e7),
        int(8.545594 * 1e7),
        488000,
        1000,
        0,
        0,
        0,
        0,  # hdg (cdeg)
    )


def main() -> None:
    start_video()
    time.sleep(0.5)

    print(f"[mock-drone] udpin :14550 sysid={SYSID} (reply to last remote)")
    m = mavutil.mavlink_connection(
        "udpin:0.0.0.0:14550",
        source_system=SYSID,
        source_component=COMPID,
    )

    last_hb = 0.0
    last_gp = 0.0
    while True:
        msg = m.recv_match(blocking=True, timeout=1.0)
        now = time.monotonic()
        if msg is None:
            continue
        if msg.get_type() == "BAD_DATA":
            continue

        # Replies must be addressed to the GCS (last sender).
        m.target_system = msg.get_srcSystem()
        m.target_component = msg.get_srcComponent()

        if now - last_hb > 0.4:
            send_uav_heartbeat(m)
            last_hb = now
        if now - last_gp > 1.0:
            send_sample_global_pos(m)
            last_gp = now

        mtype = msg.get_type()
        if mtype == "PARAM_REQUEST_READ":
            pid = msg.param_id
            if isinstance(pid, bytes):
                name = pid.split(b"\x00")[0].decode("utf-8", errors="ignore")
            else:
                name = str(pid)
            if name == "MAV_SYS_ID":
                p16 = b"MAV_SYS_ID" + b"\x00" * (16 - len(b"MAV_SYS_ID"))
                pidx = msg.param_index if msg.param_index >= 0 else 0
                m.mav.param_value_send(
                    p16,
                    float(SYSID),
                    mav.MAV_PARAM_TYPE_REAL32,
                    1,
                    pidx,
                )
        elif mtype == "COMMAND_LONG":
            cmd = msg.command
            if cmd == 512:
                m.mav.command_ack_send(512, mav.MAV_RESULT_ACCEPTED)
            elif cmd == 400:
                m.mav.command_ack_send(400, mav.MAV_RESULT_ACCEPTED)
            else:
                m.mav.command_ack_send(cmd, mav.MAV_RESULT_UNSUPPORTED)


if __name__ == "__main__":
    main()
