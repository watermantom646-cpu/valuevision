#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="/tmp/valuevision-backend-supervisor.pid"
APP_PID_FILE="/tmp/valuevision-backend-app.pid"
SUPERVISOR_SCRIPT="$ROOT_DIR/daemon-supervisor.sh"
PORT="${PORT:-5050}"
LAUNCH_AGENT_LABEL="com.valuevision.backend"
LAUNCH_AGENT_PLIST="$HOME/Library/LaunchAgents/${LAUNCH_AGENT_LABEL}.plist"

if [[ -f "$PID_FILE" ]]; then
  PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "$PID" ]] && kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null || true
    sleep 0.4
  fi
fi

SUP_PIDS="$(pgrep -f "$SUPERVISOR_SCRIPT" || true)"
if [[ -n "$SUP_PIDS" ]]; then
  while read -r pid; do
    [[ -z "$pid" ]] && continue
    kill "$pid" 2>/dev/null || true
  done <<< "$SUP_PIDS"
  sleep 0.3
fi

if [[ -f "$LAUNCH_AGENT_PLIST" ]]; then
  if launchctl list | rg -q "[[:space:]]${LAUNCH_AGENT_LABEL}$"; then
    launchctl bootout "gui/$(id -u)" "$LAUNCH_AGENT_PLIST" >/dev/null 2>&1 || true
    launchctl bootout "gui/$(id -u)/${LAUNCH_AGENT_LABEL}" >/dev/null 2>&1 || true
  fi
fi

if [[ -f "$APP_PID_FILE" ]]; then
  APP_PID="$(cat "$APP_PID_FILE" 2>/dev/null || true)"
  if [[ -n "$APP_PID" ]] && kill -0 "$APP_PID" 2>/dev/null; then
    kill "$APP_PID" 2>/dev/null || true
  fi
fi

pkill -f "node $ROOT_DIR/server.js" 2>/dev/null || true
pkill -f "node server.js" 2>/dev/null || true
if lsof -tiTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  lsof -tiTCP:"$PORT" -sTCP:LISTEN | xargs kill -9 2>/dev/null || true
fi

rm -f "$PID_FILE" "$APP_PID_FILE"

echo "Backend supervisor stopped"
