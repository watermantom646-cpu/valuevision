#!/usr/bin/env bash
set -euo pipefail

ORIGINS="${1:-}"
ENV_FILE="${2:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.env}"

if [[ -z "$ORIGINS" ]]; then
  echo "usage: $(basename "$0") '<comma-separated-origins>' [env-file]" >&2
  echo "example: $(basename "$0") 'https://valuevisionapp.com,https://www.valuevisionapp.com'" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "env file not found: $ENV_FILE" >&2
  exit 1
fi

set_kv() {
  local key="$1"
  local value="$2"
  local tmp
  tmp="$(mktemp)"
  awk -v k="$key" -v v="$value" '
    BEGIN { done = 0 }
    $0 ~ "^" k "=" {
      print k "=" v
      done = 1
      next
    }
    { print }
    END {
      if (!done) print k "=" v
    }
  ' "$ENV_FILE" > "$tmp"
  mv "$tmp" "$ENV_FILE"
}

set_kv "NODE_ENV" "production"
set_kv "ALLOWED_ORIGINS" "$ORIGINS"

echo "Applied production env to ${ENV_FILE}"
echo "  NODE_ENV=production"
echo "  ALLOWED_ORIGINS=$ORIGINS"
echo "Restart backend: cd backend && npm run daemon:stop && npm run daemon:start"
