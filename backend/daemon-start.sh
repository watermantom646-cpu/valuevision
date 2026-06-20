#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="/tmp/valuevision-backend-supervisor.pid"
APP_PID_FILE="/tmp/valuevision-backend-app.pid"
SUPERVISOR_SCRIPT="$ROOT_DIR/daemon-supervisor.sh"
SUP_LOG="/tmp/valuevision-backend-supervisor.log"
APP_LOG="/tmp/valuevision-backend.log"
PORT="${PORT:-5050}"
LAUNCH_AGENT_LABEL="com.valuevision.backend"
LAUNCH_AGENT_PLIST="$HOME/Library/LaunchAgents/${LAUNCH_AGENT_LABEL}.plist"

kill_supervisors() {
  local pids
  pids="$(pgrep -f "$SUPERVISOR_SCRIPT" || true)"
  if [[ -n "$pids" ]]; then
    while read -r pid; do
      [[ -z "$pid" ]] && continue
      kill "$pid" 2>/dev/null || true
    done <<< "$pids"
    sleep 0.3
    pids="$(pgrep -f "$SUPERVISOR_SCRIPT" || true)"
    if [[ -n "$pids" ]]; then
      while read -r pid; do
        [[ -z "$pid" ]] && continue
        kill -9 "$pid" 2>/dev/null || true
      done <<< "$pids"
    fi
  fi
}

stop_legacy_launch_agent() {
  if [[ ! -f "$LAUNCH_AGENT_PLIST" ]]; then
    return
  fi
  if launchctl list | rg -q "[[:space:]]${LAUNCH_AGENT_LABEL}$"; then
    launchctl bootout "gui/$(id -u)" "$LAUNCH_AGENT_PLIST" >/dev/null 2>&1 || true
    launchctl bootout "gui/$(id -u)/${LAUNCH_AGENT_LABEL}" >/dev/null 2>&1 || true
    sleep 0.2
    echo "Disabled legacy launch agent (${LAUNCH_AGENT_LABEL})"
  fi
}

if [[ -f "$PID_FILE" ]]; then
  OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "$OLD_PID" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    if ps -p "$OLD_PID" -o command= | rg -F "$SUPERVISOR_SCRIPT" >/dev/null 2>&1; then
      echo "Supervisor already running (pid $OLD_PID)"
      exit 0
    fi
  fi
  rm -f "$PID_FILE"
fi

kill_supervisors
stop_legacy_launch_agent

rm -f "$APP_PID_FILE"
if lsof -tiTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  lsof -tiTCP:"$PORT" -sTCP:LISTEN | xargs kill -9 2>/dev/null || true
fi
pkill -f "node $ROOT_DIR/server.js" 2>/dev/null || true
pkill -f "node server.js" 2>/dev/null || true

: > "$SUP_LOG"
: > "$APP_LOG"

# Start the supervisor in a separate session so npm's shell teardown does not
# terminate the detached backend immediately on macOS.
python3 - <<'PY' "$SUPERVISOR_SCRIPT"
import os
import subprocess
import sys

script = sys.argv[1]
with open(os.devnull, "rb") as stdin, open(os.devnull, "ab") as stdout, open(os.devnull, "ab") as stderr:
    subprocess.Popen(
        [script],
        stdin=stdin,
        stdout=stdout,
        stderr=stderr,
        start_new_session=True,
        close_fds=True,
    )
PY

for _ in $(seq 1 25); do
  NEW_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "$NEW_PID" ]] && kill -0 "$NEW_PID" 2>/dev/null; then
    echo "Supervisor started (pid $NEW_PID)"
    break
  fi
  sleep 0.1
done

if [[ ! -f "$PID_FILE" ]]; then
  echo "Failed to start backend supervisor"
  exit 1
fi

for _ in $(seq 1 30); do
  if curl -fsS -m 1 "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
    echo "Backend ready on port ${PORT}"
    exit 0
  fi
  sleep 0.2
done

echo "Backend startup pending (health check not ready yet)"
