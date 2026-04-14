FROM python:3.11-slim-bookworm
RUN pip install --no-cache-dir pymavlink
WORKDIR /app
COPY test_mavlink_video.py .
ENTRYPOINT ["python3", "/app/test_mavlink_video.py"]
