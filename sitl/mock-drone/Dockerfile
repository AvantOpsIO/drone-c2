FROM python:3.11-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends \
    gstreamer1.0-plugins-base gstreamer1.0-plugins-good \
    gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly gstreamer1.0-tools \
    iproute2 \
  && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir pymavlink
WORKDIR /app
COPY mock_drone.py rtp-udp-5600.sh /app/
RUN chmod +x /app/rtp-udp-5600.sh
EXPOSE 14550/udp 5600/udp
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=6 \
  CMD bash -c 'ss -uln | grep -q 14550'
ENTRYPOINT ["python3", "/app/mock_drone.py"]
