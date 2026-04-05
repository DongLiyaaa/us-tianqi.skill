#!/usr/bin/env bash
set -euo pipefail

HOST="${1:-127.0.0.1}"

for port in 4173 4174 4175 4176 4177 4178 4179 4180 4181 4182 4183 4184 4185 4186 4187 4188 4189 4190; do
  if curl -fsS "http://${HOST}:${port}/api/health" >/dev/null 2>&1; then
    echo "OK http://${HOST}:${port}/api/health"
    exit 0
  fi
done

echo "No healthy local dashboard API found on ports 4173-4190." >&2
exit 1
