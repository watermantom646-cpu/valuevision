#!/usr/bin/env node

const BASE_URL = String(process.env.BASE_URL || "http://127.0.0.1:5050").replace(/\/+$/, "");
const TIMEOUT_MS = Math.max(1500, Number(process.env.STATUS_TIMEOUT_MS || 7000));

async function fetchJson(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, { signal: controller.signal });
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok) {
      throw new Error(`${path} failed (${res.status}): ${text || "no body"}`);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

function gbp(value) {
  return `£${Number(value || 0).toFixed(2)}`;
}

function pct(part, whole) {
  if (!whole) return "n/a";
  return `${((Number(part || 0) / Number(whole)) * 100).toFixed(1)}%`;
}

(async () => {
  try {
    const [health, readiness, providerUsage] = await Promise.all([
      fetchJson("/health"),
      fetchJson("/launch-readiness"),
      fetchJson("/provider-usage"),
    ]);

    const usage = providerUsage?.usage || {};
    const limits = usage?.limits || {};
    const byEndpoint = usage?.byEndpoint || {};
    const cost = providerUsage?.cost || {};
    const endpointCosts = cost?.endpointCostsGbp || {};
    const monetization = readiness?.monetization || providerUsage?.policy?.paidAccess || {};
    const monetizationUsage = providerUsage?.monetizationUsage || {};
    const monetizationByType = monetizationUsage?.byType || {};

    const checks = readiness?.checks && typeof readiness.checks === "object" ? readiness.checks : {};
    const blockers = Array.isArray(readiness?.blockers)
      ? readiness.blockers
      : Object.entries(checks)
          .filter(([, ok]) => !ok)
          .map(([key]) => key);
    const criticalBlockers = blockers.filter((key) =>
      [
        "backendReachable",
        "nodeEnvProduction",
        "allowedOriginsConfigured",
        "serpApiConfigured",
        "dvlaConfigured",
        "openAiConfigured",
        "checkcarPrimaryConfigured",
        "checkcarValuationConfigured",
        "monetizationProtectionConfigured",
      ].includes(key)
    );

    console.log("[launch-status] ValueVision");
    console.log(`[launch-status] base=${BASE_URL}`);
    console.log(`[launch-status] backend_ok=${Boolean(health?.ok)} port=${health?.port || "?"}`);
    console.log(
      `[launch-status] readiness=${Number(readiness?.readyScore || 0)}/${Number(readiness?.maxScore || 0)}`
    );
    if (monetization && typeof monetization === "object") {
      const mode = monetization?.mode || "unknown";
      const tokenConfigured = Boolean(monetization?.tokenConfigured);
      const enforceVehicleData = monetization?.enforceVehicleData;
      console.log(
        `[launch-status] monetization mode=${mode} token_configured=${tokenConfigured} enforce_vehicle_data=${String(
          enforceVehicleData
        )}`
      );
    }

    const total = Number(usage?.total || 0);
    const soft = Number(limits?.soft || 0);
    const hard = Number(limits?.hard || 0);
    console.log(
      `[launch-status] usage_total=${total} soft=${soft > 0 ? `${total}/${soft} (${pct(total, soft)})` : "disabled"} hard=${
        hard > 0 ? `${total}/${hard} (${pct(total, hard)})` : "disabled"
      }`
    );
    if (blockers.length) {
      console.log(`[launch-status] blockers=${blockers.join(",")}`);
    }

    console.log(`[launch-status] estimated_cost_today=${gbp(cost?.totalGbp)} avg_cost_per_call=${gbp(cost?.avgCostPerCallGbp)}`);
    console.log(
      `[launch-status] endpoint_usage vehiclereg=${Number(byEndpoint.vehiclereg || 0)} ukvehicledata=${Number(
        byEndpoint.ukvehicledata || 0
      )} carhistory=${Number(byEndpoint.carhistory || 0)} valuation=${Number(byEndpoint.valuation || 0)}`
    );
    console.log(
      `[launch-status] endpoint_costs vehiclereg=${gbp(endpointCosts?.vehiclereg)} ukvehicledata=${gbp(
        endpointCosts?.ukvehicledata
      )} carhistory=${gbp(endpointCosts?.carhistory)} valuation=${gbp(endpointCosts?.valuation)}`
    );
    console.log(
      `[launch-status] monetization_usage blocked_vehicle_pricing=${Number(
        monetizationByType?.blocked_vehicle_pricing || 0
      )} blocked_fullcar_check=${Number(
        monetizationByType?.blocked_fullcar_check || 0
      )} allowed_vehicle_pricing=${Number(
        monetizationByType?.allowed_vehicle_pricing || 0
      )} allowed_fullcar_check=${Number(monetizationByType?.allowed_fullcar_check || 0)}`
    );

    const toSoft = providerUsage?.headroom?.toSoftLimitCalls;
    const toHard = providerUsage?.headroom?.toHardLimitCalls;
    if (toSoft !== null || toHard !== null) {
      console.log(`[launch-status] headroom to_soft_calls=${toSoft ?? "n/a"} to_hard_calls=${toHard ?? "n/a"}`);
    }

    if (hard > 0 && total >= hard) {
      console.log("[launch-status] recommendation=HARD_LIMIT_REACHED reduce traffic and rotate to lean internal tests only");
      process.exitCode = 2;
      return;
    }
    if (criticalBlockers.length) {
      console.log(`[launch-status] recommendation=NO_GO fix_critical_blockers=${criticalBlockers.join(",")}`);
      if (criticalBlockers.includes("nodeEnvProduction") || criticalBlockers.includes("allowedOriginsConfigured")) {
        console.log(
          "[launch-status] fix_hint=npm run launch:set-prod -- 'https://<prod-origin-1>,https://<prod-origin-2>'"
        );
      }
      process.exitCode = 3;
      return;
    }
    if (soft > 0 && total >= soft) {
      console.log("[launch-status] recommendation=SOFT_LIMIT_REACHED keep customer flow, stop heavy internal testing");
      return;
    }
    if (soft > 0 && total >= soft * 0.8) {
      console.log("[launch-status] recommendation=APPROACHING_SOFT_LIMIT monitor every 30 minutes");
      return;
    }
    console.log("[launch-status] recommendation=HEALTHY");
  } catch (err) {
    console.error(`[launch-status] error=${String(err?.message || err)}`);
    process.exit(1);
  }
})();
