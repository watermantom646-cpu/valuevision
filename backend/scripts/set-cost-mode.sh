#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-lean}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${2:-${SCRIPT_DIR}/../.env}"

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

case "$MODE" in
  lean)
    set_kv "CHECKCAR_UKVEHICLEDATA_URL_TEMPLATE" ""
    set_kv "CHECKCAR_CARHISTORY_URL_TEMPLATE" ""
    set_kv "CHECKCAR_VALUATION_URL_TEMPLATE" ""
    set_kv "UK_OCR_STATUS_LOOKUP_MAX" "1"
    set_kv "CHECKCAR_STATUS_TIMEOUT_MS" "2500"
    set_kv "ACCURACY_STRICT_MODE" "0"
    set_kv "CHECKCAR_DAILY_SOFT_LIMIT" "80"
    set_kv "CHECKCAR_DAILY_HARD_LIMIT" "120"
    set_kv "CHECKCAR_SKIP_ENRICH_AT_SOFT_LIMIT" "1"
    set_kv "CHECKCAR_ENFORCE_HARD_LIMIT" "1"
    ;;
  full)
    set_kv "CHECKCAR_UKVEHICLEDATA_URL_TEMPLATE" "https://api.checkcardetails.co.uk/vehicledata/ukvehicledata?apikey={key}&vrm={vrm}"
    set_kv "CHECKCAR_CARHISTORY_URL_TEMPLATE" "https://api.checkcardetails.co.uk/vehicledata/carhistorycheck?apikey={key}&vrm={vrm}"
    set_kv "CHECKCAR_VALUATION_URL_TEMPLATE" "https://api.checkcardetails.co.uk/vehicledata/vehiclevaluation?apikey={key}&vrm={vrm}"
    set_kv "UK_OCR_STATUS_LOOKUP_MAX" "2"
    set_kv "CHECKCAR_STATUS_TIMEOUT_MS" "3500"
    set_kv "ACCURACY_STRICT_MODE" "0"
    set_kv "CHECKCAR_DAILY_SOFT_LIMIT" "240"
    set_kv "CHECKCAR_DAILY_HARD_LIMIT" "320"
    set_kv "CHECKCAR_SKIP_ENRICH_AT_SOFT_LIMIT" "1"
    set_kv "CHECKCAR_ENFORCE_HARD_LIMIT" "1"
    ;;
  *)
    echo "usage: $(basename "$0") [lean|full] [env-file]" >&2
    exit 1
    ;;
esac

echo "Applied cost mode '${MODE}' to ${ENV_FILE}"
awk -F= '/^(CHECKCAR_UKVEHICLEDATA_URL_TEMPLATE|CHECKCAR_CARHISTORY_URL_TEMPLATE|CHECKCAR_VALUATION_URL_TEMPLATE|UK_OCR_STATUS_LOOKUP_MAX|CHECKCAR_STATUS_TIMEOUT_MS|ACCURACY_STRICT_MODE|CHECKCAR_DAILY_SOFT_LIMIT|CHECKCAR_DAILY_HARD_LIMIT|CHECKCAR_SKIP_ENRICH_AT_SOFT_LIMIT|CHECKCAR_ENFORCE_HARD_LIMIT)=/{
  if (length($2)==0) {
    print "  " $1 "=<blank>"
  } else {
    print "  " $1 "=<set>"
  }
}' "$ENV_FILE"

echo "Restart backend to apply: cd backend && npm run daemon:stop && npm run daemon:start"
