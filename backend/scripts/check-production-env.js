#!/usr/bin/env node

const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

function read(name) {
  return String(process.env[name] || "").trim();
}

function hasValue(name) {
  return read(name).length > 0;
}

function looksPlaceholder(value) {
  const v = String(value || "").toLowerCase();
  if (!v) return true;
  return (
    v.includes("your_") ||
    v.includes("replace_") ||
    v.includes("example") ||
    v.includes("changeme") ||
    v.includes("placeholder")
  );
}

function boolFromAny(value) {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

const nodeEnv = read("NODE_ENV");
const isProd = nodeEnv.toLowerCase() === "production";
const allowedOrigins = read("ALLOWED_ORIGINS");
const paidAccessMode = read("PAID_ACCESS_MODE").toLowerCase() || "open";
const enforcePaidVehicleData = read("ENFORCE_PAID_ACCESS_FOR_VEHICLE_DATA");
const paidAccessToken = read("PAID_ACCESS_TOKEN");

const checks = [
  {
    label: "NODE_ENV is production",
    ok: isProd,
    detail: nodeEnv || "missing",
    required: true,
  },
  {
    label: "ALLOWED_ORIGINS configured",
    ok: allowedOrigins.length > 0,
    detail: allowedOrigins || "missing",
    required: true,
  },
  {
    label: "SERPAPI_KEY present",
    ok: hasValue("SERPAPI_KEY") && !looksPlaceholder(read("SERPAPI_KEY")),
    detail: hasValue("SERPAPI_KEY") ? "set" : "missing",
    required: true,
  },
  {
    label: "OPENAI_API_KEY present",
    ok: hasValue("OPENAI_API_KEY") && !looksPlaceholder(read("OPENAI_API_KEY")),
    detail: hasValue("OPENAI_API_KEY") ? "set" : "missing",
    required: true,
  },
  {
    label: "DVLA_VEHICLE_API_KEY present",
    ok: hasValue("DVLA_VEHICLE_API_KEY") && !looksPlaceholder(read("DVLA_VEHICLE_API_KEY")),
    detail: hasValue("DVLA_VEHICLE_API_KEY") ? "set" : "missing",
    required: true,
  },
  {
    label: "CHECKCAR API key present",
    ok:
      (hasValue("CHECKCAR_API_KEY") && !looksPlaceholder(read("CHECKCAR_API_KEY"))) ||
      (hasValue("DVLA_VEHICLE_API_KEY") && !looksPlaceholder(read("DVLA_VEHICLE_API_KEY"))),
    detail: hasValue("CHECKCAR_API_KEY") || hasValue("DVLA_VEHICLE_API_KEY") ? "set" : "missing",
    required: true,
  },
  {
    label: "CHECKCAR valuation template present",
    ok: hasValue("CHECKCAR_VALUATION_URL_TEMPLATE") && !looksPlaceholder(read("CHECKCAR_VALUATION_URL_TEMPLATE")),
    detail: hasValue("CHECKCAR_VALUATION_URL_TEMPLATE") ? "set" : "missing",
    required: true,
  },
  {
    label: "CHECKCAR status template present",
    ok:
      hasValue("CHECKCAR_UKVEHICLEDATA_URL_TEMPLATE") &&
      !looksPlaceholder(read("CHECKCAR_UKVEHICLEDATA_URL_TEMPLATE")),
    detail: hasValue("CHECKCAR_UKVEHICLEDATA_URL_TEMPLATE") ? "set" : "missing",
    required: true,
  },
  {
    label: "CHECKCAR history template present",
    ok:
      hasValue("CHECKCAR_CARHISTORY_URL_TEMPLATE") &&
      !looksPlaceholder(read("CHECKCAR_CARHISTORY_URL_TEMPLATE")),
    detail: hasValue("CHECKCAR_CARHISTORY_URL_TEMPLATE") ? "set" : "missing",
    required: true,
  },
  {
    label: "BETA_STRICT_MODE enabled",
    ok: read("BETA_STRICT_MODE") !== "0",
    detail: read("BETA_STRICT_MODE") || "default(1)",
    required: false,
  },
  {
    label: "Hard limit enforcement enabled",
    ok: read("CHECKCAR_ENFORCE_HARD_LIMIT") !== "0",
    detail: read("CHECKCAR_ENFORCE_HARD_LIMIT") || "default(1)",
    required: false,
  },
  {
    label: "PAID_ACCESS_MODE valid",
    ok: ["open", "token", "locked"].includes(paidAccessMode),
    detail: paidAccessMode || "missing(default=open)",
    required: true,
  },
  {
    label: "Vehicle paid-access enforcement enabled",
    ok: boolFromAny(enforcePaidVehicleData || "1"),
    detail: enforcePaidVehicleData || "default(1)",
    required: true,
  },
  {
    label: "PAID_ACCESS_TOKEN set when PAID_ACCESS_MODE=token",
    ok: paidAccessMode !== "token" || (paidAccessToken.length > 0 && !looksPlaceholder(paidAccessToken)),
    detail: paidAccessMode === "token" ? (paidAccessToken ? "set" : "missing") : "not_required",
    required: true,
  },
  {
    label: "Production avoids PAID_ACCESS_MODE=open",
    ok: !isProd || !boolFromAny(enforcePaidVehicleData || "1") || paidAccessMode !== "open",
    detail: isProd ? paidAccessMode : "not_production",
    required: true,
  },
];

const requiredFailures = checks.filter((c) => c.required && !c.ok);
const optionalFailures = checks.filter((c) => !c.required && !c.ok);
const passed = checks.filter((c) => c.ok).length;

console.log("[env-check] ValueVision production config check");
console.log(`[env-check] passed ${passed}/${checks.length}`);

for (const c of checks) {
  const icon = c.ok ? "PASS" : c.required ? "FAIL" : "WARN";
  console.log(`[env-check] ${icon} ${c.label} (${c.detail})`);
}

if (optionalFailures.length) {
  console.log(`[env-check] warning_count=${optionalFailures.length}`);
}

if (requiredFailures.length) {
  console.error(`[env-check] required_failures=${requiredFailures.length}`);
  process.exit(1);
}

console.log("[env-check] all required checks passed.");
