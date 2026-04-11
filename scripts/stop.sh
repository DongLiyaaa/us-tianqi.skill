#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/.runtime"
PID_FILE="$RUNTIME_DIR/server.pid"
PORT_FILE="$RUNTIME_DIR/active-port.json"

if [[ ! -f "$PID_FILE" ]]; then
  echo "No managed local dashboard process is running."
  exit 0
fi

PID="$(cat "$PID_FILE" 2>/dev/null || true)"

if [[ -z "${PID}" ]]; then
  if [[ -f "$PORT_FILE" ]]; then
    PORT="$(
PORT_FILE="$PORT_FILE" python3 - <<'PY'
import json
import os
from pathlib import Path

path = Path(os.environ["PORT_FILE"])
try:
    payload = json.loads(path.read_text())
    port = payload.get("port")
    if isinstance(port, int):
        print(port)
    elif isinstance(port, str) and port.isdigit():
        print(port)
except Exception:
    pass
PY
)"
    if [[ -n "${PORT}" ]]; then
      PID="$(lsof -tiTCP:${PORT} -sTCP:LISTEN 2>/dev/null | head -n 1 || true)"
    fi
  fi
  if [[ -z "${PID}" ]]; then
    rm -f "$PID_FILE"
    echo "Removed empty pid file."
    exit 0
  fi
fi

if ! kill -0 "$PID" >/dev/null 2>&1 && [[ -f "$PORT_FILE" ]]; then
  PORT="$(
PORT_FILE="$PORT_FILE" python3 - <<'PY'
import json
import os
from pathlib import Path

path = Path(os.environ["PORT_FILE"])
try:
    payload = json.loads(path.read_text())
    port = payload.get("port")
    if isinstance(port, int):
        print(port)
    elif isinstance(port, str) and port.isdigit():
        print(port)
except Exception:
    pass
PY
)"
  if [[ -n "${PORT}" ]]; then
    PID="$(lsof -tiTCP:${PORT} -sTCP:LISTEN 2>/dev/null | head -n 1 || true)"
  fi
fi

if kill -0 "$PID" >/dev/null 2>&1; then
  kill "$PID" >/dev/null 2>&1 || true
  for _ in {1..20}; do
    if ! kill -0 "$PID" >/dev/null 2>&1; then
      break
    fi
    sleep 0.25
  done
  if kill -0 "$PID" >/dev/null 2>&1; then
    kill -9 "$PID" >/dev/null 2>&1 || true
  fi
  echo "Stopped local dashboard process: $PID"
else
  echo "Managed process $PID was not running."
fi

rm -f "$PID_FILE" "$RUNTIME_DIR/active-port.json"
