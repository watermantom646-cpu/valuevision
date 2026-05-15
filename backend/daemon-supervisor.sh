#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="/tmp/valuevision-backend-supervisor.pid"
APP_PID_FILE="/tmp/valuevision-backend-app.pid"
SUP_LOG="/tmp/valuevision-backend-supervisor.log"
APP_LOG="/tmp/valuevision-backend.log"
RESTART_DELAY_SECS="${RESTART_DELAY_SECS:-2}"

child_pid=""

timestamp() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

cleanup() {
  local exit_code=$?
  if [[ -n "$child_pid" ]] && kill -0 "$child_pid" 2>/dev/null; then
    kill "$child_pid" 2>/dev/null || true
    wait "$child_pid" 2>/dev/null || true
  fi
  rm -f "$APP_PID_FILE"
  rm -f "$PID_FILE"
  echo "[$(timestamp)] supervisor exiting with code ${exit_code}" >> "$SUP_LOG"
}

trap cleanup EXIT INT TERM HUP

cd "$ROOT_DIR"
echo "$$" > "$PID_FILE"

while true; do
  echo "[$(timestamp)] starting backend" >> "$SUP_LOG"
  node server.js >> "$APP_LOG" 2>&1 &
  child_pid=$!
  echo "$child_pid" > "$APP_PID_FILE"

  set +e
  wait "$child_pid"
  exit_code=$?
  set -e

  rm -f "$APP_PID_FILE"
  child_pid=""

  if [[ "$exit_code" -eq 0 ]]; then
    echo "[$(timestamp)] backend exited cleanly; supervisor stopping" >> "$SUP_LOG"
    break
  fi

  echo "[$(timestamp)] backend exited with code ${exit_code}; restarting in ${RESTART_DELAY_SECS}s" >> "$SUP_LOG"
  sleep "$RESTART_DELAY_SECS"
done
