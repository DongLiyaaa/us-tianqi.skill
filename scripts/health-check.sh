#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/.runtime"
PORT_FILE="$RUNTIME_DIR/active-port.json"
HOST="${1:-127.0.0.1}"

check_port() {
  local port="$1"
  if curl -fsS "http://${HOST}:${port}/api/health" >/dev/null 2>&1; then
    echo "OK http://${HOST}:${port}/api/health"
    exit 0
  fi
}

if [[ -f "$PORT_FILE" ]]; then
  PORT="$(PORT_FILE="$PORT_FILE" python3 - <<'PY'
import json
import os
from pathlib import Path

path = Path(os.environ["PORT_FILE"])
try:
    payload = json.loads(path.read_text())
    port = payload.get("port")
    if isinstance(port, str) and port.isdigit():
        print(port)
    elif isinstance(port, int):
        print(port)
except Exception:
    pass
PY
)"
  if [[ -n "${PORT}" ]]; then
    check_port "$PORT"
  fi
fi

for port in 4200 4201 4202 4203 4204 4205 4206 4207 4208 4209 4210 4211 4212 4213 4214 4215 4216 4217; do
  check_port "$port"
done

echo "No healthy local dashboard API found on ports 4200-4217." >&2
exit 1
