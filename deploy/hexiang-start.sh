#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$HOME/apps/risk-platform"
RUN_ROOT="$HOME/apps/risk-platform-runtime"
CONFIG_FILE="$HOME/.config/risk-platform/server.env"
PID_FILE="$RUN_ROOT/app.pid"
LOG_FILE="$RUN_ROOT/app.log"

mkdir -p "$RUN_ROOT"

if [[ -s "$PID_FILE" ]] && kill -0 "$(sed -n '1p' "$PID_FILE")" 2>/dev/null; then
    exit 0
fi

cd "$APP_ROOT"
set -a
source "$CONFIG_FILE"
set +a

nohup node server-file.js </dev/null >>"$LOG_FILE" 2>&1 &
echo $! >"$PID_FILE"
