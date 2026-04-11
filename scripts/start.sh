#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

RUNTIME_DIR="$ROOT_DIR/.runtime"
LOG_FILE="$RUNTIME_DIR/server.log"
PID_FILE="$RUNTIME_DIR/server.pid"
PORT_FILE="$RUNTIME_DIR/active-port.json"

mkdir -p "$RUNTIME_DIR"

adopt_existing_service() {
  local health_url="$1"
  local port
  port="$(printf '%s' "$health_url" | sed -E 's#.*:([0-9]+)/api/health#\1#')"

  if [[ -z "${port}" ]]; then
    echo "$health_url"
    return 0
  fi

  local pid
  pid="$(lsof -tiTCP:${port} -sTCP:LISTEN 2>/dev/null | head -n 1 || true)"
  if [[ -n "${pid}" ]]; then
    echo "$pid" > "$PID_FILE"
  fi

  PORT="$port" PID="${pid:-}" PORT_FILE="$PORT_FILE" python3 - <<'PY'
import json
import os
from pathlib import Path

port = int(os.environ["PORT"])
pid = os.environ.get("PID", "")
payload = {
    "pid": int(pid) if pid.isdigit() else None,
    "port": port,
    "origin": f"http://127.0.0.1:{port}",
    "adoptedAt": __import__("datetime").datetime.utcnow().isoformat() + "Z",
}
Path(os.environ["PORT_FILE"]).write_text(json.dumps(payload, indent=2))
PY

  echo "Adopted existing local dashboard on port ${port}${pid:+ (pid $pid)}."
  echo "$health_url"
}

if [[ -f "$PID_FILE" ]]; then
  PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "${PID}" ]] && kill -0 "$PID" >/dev/null 2>&1; then
    echo "Local dashboard is already running (pid $PID)."
    bash "$ROOT_DIR/scripts/health-check.sh" || true
    exit 0
  fi
  rm -f "$PID_FILE"
fi

if EXISTING_HEALTH="$(bash "$ROOT_DIR/scripts/health-check.sh" 2>/dev/null)"; then
  echo "Detected an already healthy local dashboard."
  adopt_existing_service "$EXISTING_HEALTH"
  exit 0
fi

echo "Starting seasonal dashboard from: $ROOT_DIR"
PID="$(
ROOT_DIR="$ROOT_DIR" LOG_FILE="$LOG_FILE" python3 - <<'PY'
import os
import subprocess
from pathlib import Path

root = os.environ["ROOT_DIR"]
log_path = Path(os.environ["LOG_FILE"])
log_path.parent.mkdir(parents=True, exist_ok=True)

with log_path.open("a", encoding="utf-8") as stream:
    proc = subprocess.Popen(
        ["node", "server.mjs"],
        cwd=root,
        stdin=subprocess.DEVNULL,
        stdout=stream,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    print(proc.pid)
PY
)"
echo "$PID" > "$PID_FILE"

for _ in {1..40}; do
  if [[ -f "$PORT_FILE" ]]; then
    PORT="$(PORT_FILE="$PORT_FILE" EXPECTED_PID="$PID" python3 - <<'PY'
import json
import os
from pathlib import Path

path = Path(os.environ["PORT_FILE"])
expected_pid = int(os.environ["EXPECTED_PID"])

try:
    payload = json.loads(path.read_text())
    if payload.get("pid") == expected_pid:
        port = payload.get("port")
        if isinstance(port, int):
            print(port)
        elif isinstance(port, str) and port.isdigit():
            print(port)
except Exception:
    pass
PY
)"
    if [[ -n "${PORT}" ]] && curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
      echo "Started local dashboard (pid $PID)"
      echo "OK http://127.0.0.1:${PORT}/api/health"
      exit 0
    fi
  fi

  if ! kill -0 "$PID" >/dev/null 2>&1; then
    echo "Local dashboard exited during startup. Recent log:"
    tail -n 60 "$LOG_FILE" || true
    rm -f "$PID_FILE"
    exit 1
  fi

  sleep 0.5
done

echo "Local dashboard did not become healthy in time. Recent log:"
tail -n 60 "$LOG_FILE" || true
exit 1
