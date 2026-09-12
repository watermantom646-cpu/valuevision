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
const carChecksEnabled = boolFromAny(read("CAR_CHECKS_ENABLED"));
const bregoIsCarProvider = read("CAR_DATA_PROVIDER").toLowerCase() === "brego";
const itemAnalyzeDailyHardLimit = Number(read("ITEM_ANALYZE_DAILY_HARD_LIMIT") || 120);
const itemAnalyzePerIpDailyHardLimit = Number(read("ITEM_ANALYZE_PER_IP_DAILY_HARD_LIMIT") || 15);
const growthDashboardToken = read("GROWTH_DASHBOARD_TOKEN");
const webPaymentsRequired = read("WEB_PAYMENTS_ENABLED") === "1";
const applePaymentsRequired = read("APPLE_PAYMENTS_ENABLED") !== "0";

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
    label: "Search provider key present",
    ok:
      (hasValue("BRAVE_SEARCH_API_KEY") && !looksPlaceholder(read("BRAVE_SEARCH_API_KEY"))) ||
      (hasValue("SERPAPI_KEY") && !looksPlaceholder(read("SERPAPI_KEY"))),
    detail: hasValue("BRAVE_SEARCH_API_KEY") ? "brave" : hasValue("SERPAPI_KEY") ? "serpapi" : "missing",
    required: true,
  },
  {
    label: "AI provider key present",
    ok:
      (hasValue("GEMINI_API_KEY") && !looksPlaceholder(read("GEMINI_API_KEY"))) ||
      (hasValue("OPENAI_API_KEY") && !looksPlaceholder(read("OPENAI_API_KEY"))),
    detail: hasValue("GEMINI_API_KEY") ? "gemini" : hasValue("OPENAI_API_KEY") ? "openai" : "missing",
    required: true,
  },
  {
    label: "DVLA_VEHICLE_API_KEY present",
    ok: !carChecksEnabled || (hasValue("DVLA_VEHICLE_API_KEY") && !looksPlaceholder(read("DVLA_VEHICLE_API_KEY"))),
    detail: carChecksEnabled ? (hasValue("DVLA_VEHICLE_API_KEY") ? "set" : "missing") : "not_required(item-first)",
    required: carChecksEnabled,
  },
  {
    label: "CHECKCAR API key present",
    ok:
      !carChecksEnabled ||
      (hasValue("CHECKCAR_API_KEY") && !looksPlaceholder(read("CHECKCAR_API_KEY"))) ||
      (hasValue("DVLA_VEHICLE_API_KEY") && !looksPlaceholder(read("DVLA_VEHICLE_API_KEY"))),
    detail: carChecksEnabled ? (hasValue("CHECKCAR_API_KEY") || hasValue("DVLA_VEHICLE_API_KEY") ? "set" : "missing") : "not_required(item-first)",
    required: carChecksEnabled,
  },
  {
    label: "CHECKCAR valuation template present",
    ok: !carChecksEnabled || (hasValue("CHECKCAR_VALUATION_URL_TEMPLATE") && !looksPlaceholder(read("CHECKCAR_VALUATION_URL_TEMPLATE"))),
    detail: carChecksEnabled ? (hasValue("CHECKCAR_VALUATION_URL_TEMPLATE") ? "set" : "missing") : "not_required(item-first)",
    required: carChecksEnabled,
  },
  {
    label: "CHECKCAR status template present",
    ok:
      !carChecksEnabled ||
      hasValue("CHECKCAR_UKVEHICLEDATA_URL_TEMPLATE") &&
      !looksPlaceholder(read("CHECKCAR_UKVEHICLEDATA_URL_TEMPLATE")),
    detail: carChecksEnabled ? (hasValue("CHECKCAR_UKVEHICLEDATA_URL_TEMPLATE") ? "set" : "missing") : "not_required(item-first)",
    required: carChecksEnabled,
  },
  {
    label: "CHECKCAR history template present",
    ok:
      !carChecksEnabled ||
      hasValue("CHECKCAR_CARHISTORY_URL_TEMPLATE") &&
      !looksPlaceholder(read("CHECKCAR_CARHISTORY_URL_TEMPLATE")),
    detail: carChecksEnabled ? (hasValue("CHECKCAR_CARHISTORY_URL_TEMPLATE") ? "set" : "missing") : "not_required(item-first)",
    required: carChecksEnabled,
  },
  {
    label: "Item analysis daily hard limit enabled",
    ok: Number.isFinite(itemAnalyzeDailyHardLimit) && itemAnalyzeDailyHardLimit > 0,
    detail: String(itemAnalyzeDailyHardLimit),
    required: true,
  },
  {
    label: "Item analysis per-client hard limit enabled",
    ok: Number.isFinite(itemAnalyzePerIpDailyHardLimit) && itemAnalyzePerIpDailyHardLimit > 0,
    detail: String(itemAnalyzePerIpDailyHardLimit),
    required: true,
  },
  {
    label: "Growth dashboard token configured",
    ok: growthDashboardToken.length >= 32 && !looksPlaceholder(growthDashboardToken),
    detail: growthDashboardToken ? "set" : "missing",
    required: true,
  },
  {
    label: "Stripe web payments configured",
    ok: !webPaymentsRequired || ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_MONTHLY_PRICE_ID", "PUBLIC_APP_URL"].every((name) => hasValue(name) && !looksPlaceholder(read(name))),
    detail: webPaymentsRequired ? (hasValue("STRIPE_SECRET_KEY") ? "partially_or_fully_set" : "missing") : "disabled",
    required: webPaymentsRequired,
  },
  {
    label: "Apple server purchase verification configured",
    ok: !applePaymentsRequired || ["APPLE_ISSUER_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY", "APPLE_BUNDLE_ID"].every((name) => hasValue(name) && !looksPlaceholder(read(name))),
    detail: applePaymentsRequired ? (hasValue("APPLE_ISSUER_ID") ? "partially_or_fully_set" : "missing") : "disabled",
    required: applePaymentsRequired,
  },
  {
    label: "Payment sandbox checks recorded",
    ok:
      (!webPaymentsRequired || read("PAYMENT_SANDBOX_VERIFIED") === "1") &&
      (!applePaymentsRequired || read("APPLE_SANDBOX_VERIFIED") === "1"),
    detail: `stripe=${read("PAYMENT_SANDBOX_VERIFIED") || "0"},apple=${read("APPLE_SANDBOX_VERIFIED") || "0"}`,
    required: webPaymentsRequired || applePaymentsRequired,
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

if (carChecksEnabled && bregoIsCarProvider) {
  for (const check of checks) {
    if (check.label.startsWith("CHECKCAR") || check.label.startsWith("DVLA_VEHICLE_API_KEY")) {
      check.ok = true;
      check.required = false;
      check.detail = "replaced_by_brego";
    }
  }
  checks.push(
    {
      label: "Brego API key present",
      ok: hasValue("BREGO_API_KEY") && !looksPlaceholder(read("BREGO_API_KEY")),
      detail: hasValue("BREGO_API_KEY") ? "set" : "missing",
      required: true,
    },
    {
      label: "Brego valuation endpoint present",
      ok:
        (hasValue("BREGO_VALUATION_URL_TEMPLATE") && !looksPlaceholder(read("BREGO_VALUATION_URL_TEMPLATE"))) ||
        (hasValue("BREGO_API_BASE_URL") && !looksPlaceholder(read("BREGO_API_BASE_URL"))),
      detail: hasValue("BREGO_VALUATION_URL_TEMPLATE") || hasValue("BREGO_API_BASE_URL") ? "set" : "missing",
      required: true,
    },
    {
      label: "Brego full-check endpoint present",
      ok: hasValue("BREGO_FULL_CHECK_URL_TEMPLATE") && !looksPlaceholder(read("BREGO_FULL_CHECK_URL_TEMPLATE")),
      detail: hasValue("BREGO_FULL_CHECK_URL_TEMPLATE") ? "set" : "missing",
      required: true,
    }
  );
}

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
