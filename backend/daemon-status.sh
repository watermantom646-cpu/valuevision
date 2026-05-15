#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="/tmp/valuevision-backend-supervisor.pid"
APP_PID_FILE="/tmp/valuevision-backend-app.pid"
SUPERVISOR_SCRIPT="$ROOT_DIR/daemon-supervisor.sh"
PORT="${PORT:-5050}"
LAUNCH_AGENT_LABEL="com.valuevision.backend"

SUP_PIDS="$(pgrep -f "$SUPERVISOR_SCRIPT" || true)"
LAUNCH_LINE="$(launchctl list | rg -N "[[:space:]]${LAUNCH_AGENT_LABEL}$" || true)"
FILE_PID=""
if [[ -f "$PID_FILE" ]]; then
  FILE_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
fi

if [[ -n "$FILE_PID" ]] && kill -0 "$FILE_PID" 2>/dev/null && ps -p "$FILE_PID" -o command= | rg -F "$SUPERVISOR_SCRIPT" >/dev/null 2>&1; then
  echo "Supervisor: running (pid $FILE_PID)"
elif [[ -n "$FILE_PID" ]] && kill -0 "$FILE_PID" 2>/dev/null; then
  echo "Supervisor: pid file points to non-supervisor process (pid $FILE_PID)"
elif [[ -n "$SUP_PIDS" ]]; then
  PRIMARY_SUP_PID="$(echo "$SUP_PIDS" | head -n 1)"
  echo "Supervisor: running (pid $PRIMARY_SUP_PID), pid file stale"
elif [[ -f "$PID_FILE" ]]; then
  echo "Supervisor: stale pid file"
else
  echo "Supervisor: not running"
fi

if [[ -n "$LAUNCH_LINE" ]]; then
  LAUNCH_PID="$(echo "$LAUNCH_LINE" | awk '{print $1}')"
  if [[ "$LAUNCH_PID" == "-" ]]; then
    echo "LaunchAgent ${LAUNCH_AGENT_LABEL}: loaded (inactive)"
  else
    echo "LaunchAgent ${LAUNCH_AGENT_LABEL}: loaded (pid $LAUNCH_PID)"
  fi
else
  echo "LaunchAgent ${LAUNCH_AGENT_LABEL}: not loaded"
fi

LISTEN_PID="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | head -n 1 || true)"
if [[ -n "$LISTEN_PID" ]]; then
  echo "Backend port $PORT: listening (pid $LISTEN_PID)"
else
  echo "Backend port $PORT: not listening"
fi

if [[ -f "$APP_PID_FILE" ]]; then
  APP_PID="$(cat "$APP_PID_FILE" 2>/dev/null || true)"
  if [[ -n "$APP_PID" ]] && kill -0 "$APP_PID" 2>/dev/null; then
    if [[ -n "$LISTEN_PID" ]] && [[ "$APP_PID" == "$LISTEN_PID" ]]; then
      echo "Backend process: running (pid $APP_PID)"
    else
      echo "Backend process: running (pid $APP_PID), listener pid differs"
    fi
  else
    if [[ -n "$LISTEN_PID" ]]; then
      echo "Backend process: running (pid $LISTEN_PID), pid file stale"
    else
      echo "Backend process: stale pid file"
    fi
  fi
else
  if [[ -n "$LISTEN_PID" ]]; then
    echo "Backend process: running (pid $LISTEN_PID), pid file missing"
  else
    echo "Backend process: unknown"
  fi
fi

if curl -fsS -m 2 "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
  echo "Health check: OK"
else
  echo "Health check: FAIL"
fi
