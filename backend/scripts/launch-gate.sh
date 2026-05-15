#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
MODE="${1:-full}"
BASE_URL="${BASE_URL:-http://127.0.0.1:5050}"

echo "[launch-gate] mode=${MODE} base_url=${BASE_URL}"
echo "[launch-gate] started_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

for _ in $(seq 1 25); do
  if curl -fsS "${BASE_URL}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.4
done

health_json="$(curl -fsS "${BASE_URL}/health")"
echo "[launch-gate] /health -> ${health_json}"

readiness_json="$(curl -fsS "${BASE_URL}/launch-readiness")"
echo "${readiness_json}" | node -e '
  const fs = require("fs");
  const j = JSON.parse(fs.readFileSync(0, "utf8"));
  const checks = j?.checks || {};
  const min = Number(process.env.LAUNCH_MIN_READY_SCORE || Math.max(7, Math.floor((Number(j.maxScore || 0) * 0.7))));
  const score = Number(j.readyScore || 0);
  console.log(`[launch-gate] readiness score ${score}/${j.maxScore} (min ${min})`);
  if (!j.ok) {
    console.error("[launch-gate] readiness endpoint returned ok=false");
    process.exit(2);
  }
  if (score < min) {
    console.error("[launch-gate] readiness score below launch threshold");
    process.exit(3);
  }
  const prodMode = Boolean(checks?.nodeEnvProduction);
  if (prodMode && checks?.monetizationProtectionConfigured === false) {
    console.error("[launch-gate] monetization protection is not configured for production");
    process.exit(4);
  }
'

usage_json="$(curl -fsS "${BASE_URL}/provider-usage")"
echo "${usage_json}" | node -e '
  const fs = require("fs");
  const j = JSON.parse(fs.readFileSync(0, "utf8"));
  const usage = j?.usage || {};
  const soft = Number(usage?.limits?.soft || 0);
  const hard = Number(usage?.limits?.hard || 0);
  const total = Number(usage?.total || 0);
  const softText = soft > 0 ? `${total}/${soft}` : `${total}/disabled`;
  const hardText = hard > 0 ? `${total}/${hard}` : `${total}/disabled`;
  console.log(`[launch-gate] checkcar usage soft=${softText} hard=${hardText}`);
'

if [[ "${MODE}" == "quick" ]]; then
  echo "[launch-gate] quick mode complete (skipped benchmark suites)."
  exit 0
fi

cd "${BACKEND_DIR}"
echo "[launch-gate] running benchmark:uk-plates"
npm run benchmark:uk-plates
echo "[launch-gate] running benchmark:items-uk"
npm run benchmark:items-uk

echo "[launch-gate] PASS - launch gates are green."
