#!/usr/bin/env bash
# Restart the AWAJ dev server on a clean port and wait until it answers.
set -euo pipefail
cd "$(dirname "$0")/.."
LOG="${AWAJ_LOG:-/tmp/opencode/awaj.log}"
PORT="${PORT:-3000}"

pkill -f "node server/index.js" >/dev/null 2>&1 || true
sleep 0.6
mkdir -p "$(dirname "$LOG")"
setsid nohup node server/index.js > "$LOG" 2>&1 < /dev/null &

for _ in $(seq 1 40); do
  if curl -sf -o /dev/null "http://localhost:${PORT}/healthz"; then
    echo "AWAJ is up on http://localhost:${PORT}  (log: ${LOG})"
    exit 0
  fi
  sleep 0.25
done

echo "AWAJ failed to start. Log:" >&2
cat "$LOG" >&2
exit 1
