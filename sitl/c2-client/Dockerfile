FROM python:3.11-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    gstreamer1.0-tools \
    gstreamer1.0-plugins-base \
    gstreamer1.0-plugins-good \
    gstreamer1.0-plugins-bad \
    gstreamer1.0-libav \
  && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir pymavlink

WORKDIR /app
COPY main.py .

CMD ["python3", "main.py"]
