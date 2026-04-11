#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/.runtime"
PID_FILE="$RUNTIME_DIR/server.pid"
PORT_FILE="$RUNTIME_DIR/active-port.json"

if [[ -f "$PID_FILE" ]]; then
  PID="$(cat "$PID_FILE" 2>/dev/null || true)"
else
  PID=""
fi

if [[ -f "$PORT_FILE" ]]; then
  ACTUAL_PID="$(
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
  if [[ -n "${ACTUAL_PID}" ]]; then
    RESOLVED_PID="$(lsof -tiTCP:${ACTUAL_PID} -sTCP:LISTEN 2>/dev/null | head -n 1 || true)"
    if [[ -n "${RESOLVED_PID}" ]]; then
      PID="${RESOLVED_PID}"
      echo "$PID" > "$PID_FILE"
    fi
  fi
fi

if [[ -n "${PID}" ]] && kill -0 "$PID" >/dev/null 2>&1; then
  echo "Process: running (pid $PID)"
else
  echo "Process: not running"
fi

if [[ -f "$PORT_FILE" ]]; then
  echo "Runtime:"
  cat "$PORT_FILE"
  echo
fi

if HEALTH_URL="$(bash "$ROOT_DIR/scripts/health-check.sh" 2>/dev/null)"; then
  if [[ -n "${PID}" ]] && kill -0 "$PID" >/dev/null 2>&1; then
    echo "$HEALTH_URL"
  else
    echo "Healthy service detected, but it is not managed by the current pid file."
    echo "$HEALTH_URL"
  fi
else
  echo "Health: unavailable"
fi
