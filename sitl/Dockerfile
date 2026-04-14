# PX4 v1.14.3 SITL + Gazebo Classic 11 (headless). Build is slow (~30–90+ min) and image is multi‑GB.
# Build from repository root: docker build -f sitl/Dockerfile .
# Gazebo11 apt packages are not available on arm64; use: docker compose build --platform linux/amd64 drone

FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    PX4_SKIP_SUMMARY=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl wget gnupg lsb-release \
  && wget -q https://packages.osrfoundation.org/gazebo.gpg -O /usr/share/keyrings/pkgs-osrf-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/pkgs-osrf-archive-keyring.gpg] http://packages.osrfoundation.org/gazebo/ubuntu-stable $(lsb_release -cs) main" > /etc/apt/sources.list.d/gazebo-stable.list \
  && apt-get update && apt-get install -y --no-install-recommends \
    gazebo11 libgazebo11-dev \
    git cmake ccache ninja-build pkg-config \
    build-essential gdb \
    python3 python3-pip python3-dev python3-setuptools python3-wheel \
    libprotobuf-dev protobuf-compiler \
    libeigen3-dev libopencv-dev \
    libxml2-dev libxslt1-dev \
    gstreamer1.0-plugins-base gstreamer1.0-plugins-good \
    gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly gstreamer1.0-libav \
    gstreamer1.0-tools \
    xvfb x11-xserver-utils \
    tini bc rsync zip unzip file \
    iproute2 \
    libgl1-mesa-dri libgl1 \
  && rm -rf /var/lib/apt/lists/*

ARG PX4_TAG=v1.14.3
WORKDIR /px4

RUN git clone --branch "${PX4_TAG}" --single-branch https://github.com/PX4/PX4-Autopilot.git . \
  && git submodule update --init --recursive

COPY sitl/overlay/ROMFS/px4fmu_common/init.d-posix/px4-rc.mavlink ROMFS/px4fmu_common/init.d-posix/px4-rc.mavlink
COPY sitl/overlay/ROMFS/px4fmu_common/init.d-posix/px4-rc.params ROMFS/px4fmu_common/init.d-posix/px4-rc.params

RUN pip3 install --break-system-packages --no-cache-dir -r Tools/setup/requirements.txt

# Configure + px4 binary + Gazebo Classic plugins (ExternalProject).
RUN make px4_sitl_default -j"$(nproc)" \
  && ninja -C build/px4_sitl_default sitl_gazebo-classic -j"$(nproc)"

COPY sitl/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY sitl/gstreamer/rtp-udp-5600.sh /usr/local/bin/rtp-udp-5600.sh
COPY sitl/healthcheck-mavlink.py /usr/local/bin/healthcheck-mavlink.py
RUN chmod +x /usr/local/bin/entrypoint.sh /usr/local/bin/rtp-udp-5600.sh /usr/local/bin/healthcheck-mavlink.py

EXPOSE 14550/udp 5600/udp

ENV MAVLINK_HEALTH_PORT=14550 \
    MAVLINK_HEALTH_TIMEOUT_S=10

# Port bind check, then HEARTBEAT (pymavlink UDP URL quirks vary by version).
HEALTHCHECK --interval=30s --timeout=20s --start-period=300s --retries=3 \
  CMD bash -c 'ss -uln | grep -q ":14550 " && python3 /usr/local/bin/healthcheck-mavlink.py'

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
