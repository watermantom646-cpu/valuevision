#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${ROOT_DIR}/backend/.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing backend env file: ${ENV_FILE}" >&2
  exit 1
fi

read_env() {
  local key="$1"
  awk -F= -v k="$key" '$1==k{print substr($0, index($0,"=")+1); exit}' "${ENV_FILE}"
}

PAID_TOKEN="$(read_env "PAID_ACCESS_TOKEN")"
PAID_HEADER="$(read_env "PAID_ACCESS_HEADER")"

if [[ -z "${PAID_TOKEN}" ]]; then
  echo "PAID_ACCESS_TOKEN is missing in backend/.env" >&2
  exit 1
fi

if [[ -z "${PAID_HEADER}" ]]; then
  PAID_HEADER="x-valuevision-paid-token"
fi

cd "${ROOT_DIR}"
npm run backend:start

echo "Starting Expo LAN with paid-check header configured from backend/.env"
EXPO_PUBLIC_PAID_ACCESS_TOKEN="${PAID_TOKEN}" \
EXPO_PUBLIC_PAID_ACCESS_HEADER="${PAID_HEADER}" \
npx expo start --lan --clear
