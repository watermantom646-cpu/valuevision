// backend/server.js
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const dotenv = require("dotenv");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vision = require("@google-cloud/vision");

dotenv.config();

function envValue(name, fallback = "") {
  const raw = process.env[name];
  if (raw === undefined) return String(fallback || "").trim();
  return String(raw).trim();
}

function isLocalHostName(host) {
  const value = String(host || "").trim().toLowerCase();
  return value === "localhost" || value === "127.0.0.1" || value === "::1";
}

function getLanHosts() {
  const interfaces = os.networkInterfaces();
  const hosts = [];
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (!entry || entry.internal || entry.family !== "IPv4") continue;
      const address = String(entry.address || "").trim();
      if (!address) continue;
      hosts.push(address);
    }
  }
  return hosts.sort((a, b) => {
    const aPrivate = /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(a) ? 0 : 1;
    const bPrivate = /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(b) ? 0 : 1;
    return aPrivate - bPrivate || a.localeCompare(b);
  });
}

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);
const IS_PRODUCTION = String(process.env.NODE_ENV || "").toLowerCase() === "production";
const ALLOW_LOCAL_ORIGINS = String(process.env.ALLOW_LOCAL_ORIGINS || "1") !== "0";

function isLikelyLocalOrigin(origin) {
  const value = String(origin || "").trim();
  if (!value) return false;
  try {
    const u = new URL(value);
    const host = String(u.hostname || "").toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    const m = host.match(/^172\.(\d{1,2})\.\d{1,3}\.\d{1,3}$/);
    if (m) {
      const second = Number(m[1]);
      if (second >= 16 && second <= 31) return true;
    }
    return false;
  } catch {
    return false;
  }
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      if (ALLOW_LOCAL_ORIGINS && isLikelyLocalOrigin(origin)) return callback(null, true);
      if (!IS_PRODUCTION && !ALLOWED_ORIGINS.length) return callback(null, true);
      return callback(new Error("Blocked by CORS"));
    },
  })
);
if (IS_PRODUCTION && ALLOWED_ORIGINS.length === 0) {
  console.warn("[startup] NODE_ENV=production but ALLOWED_ORIGINS is empty. Browser origins will be blocked.");
}
app.use(express.json({ limit: "2mb" }));
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on("finish", () => {
    if (
      req.path === "/health" ||
      req.path === "/analyze" ||
      req.path === "/uk-vehicle-status" ||
      req.path === "/uk-plate-scan"
    ) {
      const ms = Date.now() - startedAt;
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} -> ${res.statusCode} (${ms}ms)`);
    }
  });
  next();
});

const upload = multer({ storage: multer.memoryStorage() });

const PORT = Number(process.env.PORT || 5050);
const SERPAPI_KEY = process.env.SERPAPI_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DVLA_VEHICLE_API_KEY = process.env.DVLA_VEHICLE_API_KEY;
const VEHICLE_STATUS_PROVIDER = String(process.env.VEHICLE_STATUS_PROVIDER || "dvla").trim().toLowerCase();
const CHECKCAR_API_KEY = process.env.CHECKCAR_API_KEY || DVLA_VEHICLE_API_KEY;
const CHECKCAR_URL_TEMPLATE = envValue("CHECKCAR_URL_TEMPLATE", "");
const CHECKCAR_UKVEHICLEDATA_URL_TEMPLATE = envValue(
  "CHECKCAR_UKVEHICLEDATA_URL_TEMPLATE",
  "https://api.checkcardetails.co.uk/vehicledata/ukvehicledata?apikey={key}&vrm={vrm}"
);
const CHECKCAR_CARHISTORY_URL_TEMPLATE = envValue(
  "CHECKCAR_CARHISTORY_URL_TEMPLATE",
  "https://api.checkcardetails.co.uk/vehicledata/carhistorycheck?apikey={key}&vrm={vrm}"
);
const CHECKCAR_VALUATION_URL_TEMPLATE = envValue(
  "CHECKCAR_VALUATION_URL_TEMPLATE",
  "https://api.checkcardetails.co.uk/vehicledata/vehiclevaluation?apikey={key}&vrm={vrm}"
);
const CHECKCAR_STATUS_TIMEOUT_MS = Math.max(
  1500,
  Number(process.env.CHECKCAR_STATUS_TIMEOUT_MS || 3500)
);
const CHECKCAR_USAGE_FILE = envValue("CHECKCAR_USAGE_FILE", "./data/checkcar-usage.json");
const CHECKCAR_DAILY_SOFT_LIMIT = Math.max(
  0,
  Number(process.env.CHECKCAR_DAILY_SOFT_LIMIT || 0)
);
const CHECKCAR_DAILY_HARD_LIMIT = Math.max(
  0,
  Number(process.env.CHECKCAR_DAILY_HARD_LIMIT || 0)
);
const CHECKCAR_SKIP_ENRICH_AT_SOFT_LIMIT =
  String(process.env.CHECKCAR_SKIP_ENRICH_AT_SOFT_LIMIT || "1") !== "0";
const CHECKCAR_ENFORCE_HARD_LIMIT =
  String(process.env.CHECKCAR_ENFORCE_HARD_LIMIT || "1") !== "0";
const CHECKCAR_COST_PER_VEHICLEREG_GBP = Math.max(
  0,
  Number(process.env.CHECKCAR_COST_PER_VEHICLEREG_GBP || 0.02)
);
const CHECKCAR_COST_PER_UKVEHICLEDATA_GBP = Math.max(
  0,
  Number(process.env.CHECKCAR_COST_PER_UKVEHICLEDATA_GBP || 0.10)
);
const CHECKCAR_COST_PER_CARHISTORY_GBP = Math.max(
  0,
  Number(process.env.CHECKCAR_COST_PER_CARHISTORY_GBP || 1.82)
);
const CHECKCAR_COST_PER_VALUATION_GBP = Math.max(
  0,
  Number(process.env.CHECKCAR_COST_PER_VALUATION_GBP || 0.12)
);
const EBAY_ENV = String(process.env.EBAY_ENV || "production").trim().toLowerCase();
const EBAY_CLIENT_ID = String(process.env.EBAY_CLIENT_ID || "").trim();
const EBAY_CLIENT_SECRET = String(process.env.EBAY_CLIENT_SECRET || "").trim();
const EBAY_APP_TOKEN_RAW = String(process.env.EBAY_APP_TOKEN || "").trim();
const EBAY_MARKETPLACE_ID = String(process.env.EBAY_MARKETPLACE_ID || "EBAY_GB").trim();
const EBAY_FINDING_APP_ID = String(process.env.EBAY_FINDING_APP_ID || EBAY_CLIENT_ID || "").trim();
const EBAY_FORCE_FINDING = String(process.env.EBAY_FORCE_FINDING || "0").trim() === "1";
const SERPAPI_TIMEOUT_MS = 4500;
const ANALYZE_BUDGET_MS = 9000;
const LIVE_SERP_TIMEOUT_MS = 2600;
const LIVE_ANALYZE_BUDGET_MS = 6500;
const MAX_QUERY_CANDIDATES = 3;
const MAX_QUERY_CANDIDATES_LIVE = 2;
const PRICE_CACHE_TTL_MS = 10 * 60 * 1000;
const BARCODE_ENRICH_TIMEOUT_MS = Math.max(
  1200,
  Number(process.env.BARCODE_ENRICH_TIMEOUT_MS || 2600)
);
const UK_VALUATION_CACHE_TTL_MS = Math.max(
  5 * 60 * 1000,
  Number(process.env.UK_VALUATION_CACHE_TTL_MS || 12 * 60 * 60 * 1000)
);
const UK_VALUATION_CACHE_STALE_TTL_MS = Math.max(
  UK_VALUATION_CACHE_TTL_MS,
  Number(process.env.UK_VALUATION_CACHE_STALE_TTL_MS || 7 * 24 * 60 * 60 * 1000)
);
const OUTCOME_FILE = "./outcomes.json";
const UK_VALUATION_CACHE_FILE = String(
  process.env.UK_VALUATION_CACHE_FILE || "./data/uk-valuation-cache.json"
).trim();
const UK_VALUATION_CACHE_MAX_ENTRIES = Math.max(
  500,
  Number(process.env.UK_VALUATION_CACHE_MAX_ENTRIES || 5000)
);
const UK_STATUS_CACHE_FILE = envValue("UK_STATUS_CACHE_FILE", "./data/uk-status-cache.json");
const UK_STATUS_CACHE_TTL_MS = Math.max(
  5 * 60 * 1000,
  Number(process.env.UK_STATUS_CACHE_TTL_MS || 24 * 60 * 60 * 1000)
);
const UK_STATUS_CACHE_STALE_TTL_MS = Math.max(
  UK_STATUS_CACHE_TTL_MS,
  Number(process.env.UK_STATUS_CACHE_STALE_TTL_MS || 14 * 24 * 60 * 60 * 1000)
);
const UK_STATUS_CACHE_MAX_ENTRIES = Math.max(
  500,
  Number(process.env.UK_STATUS_CACHE_MAX_ENTRIES || 20000)
);
const UK_MODEL_BASELINE_FILE = String(
  process.env.UK_MODEL_BASELINE_FILE || "./data/uk-model-baseline.json"
).trim();
const UK_MODEL_BASELINE_MAX_ENTRIES = Math.max(
  200,
  Number(process.env.UK_MODEL_BASELINE_MAX_ENTRIES || 5000)
);
const CAR_SOLD_COMPS_FILE = String(process.env.CAR_SOLD_COMPS_FILE || "./data/car-sold-comps.jsonl").trim();
const CAR_SOLD_COMPS_MAX_RETURN = Math.max(10, Number(process.env.CAR_SOLD_COMPS_MAX_RETURN || 120));
const MANUAL_SOLD_COMPS_FILE = String(process.env.MANUAL_SOLD_COMPS_FILE || "./data/manual-sold-comps.jsonl").trim();
const MARKET_CONFIG = {
  us: { gl: "us", hl: "en", currency: "USD", symbol: "$" },
  uk: { gl: "uk", hl: "en", currency: "GBP", symbol: "£" },
  eu: { gl: "de", hl: "en", currency: "EUR", symbol: "€" },
  ca: { gl: "ca", hl: "en", currency: "CAD", symbol: "C$" },
  au: { gl: "au", hl: "en", currency: "AUD", symbol: "A$" },
};
const DVLA_VEHICLE_ENQUIRY_URL = "https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles";
const UK_PLATE_AUTO_ACCEPT_CONFIDENCE = Number(process.env.UK_PLATE_AUTO_ACCEPT_CONFIDENCE || 0.86);
const UK_PLATE_REQUIRE_DOUBLE_MATCH = String(process.env.UK_PLATE_REQUIRE_DOUBLE_MATCH || "1") !== "0";
const UK_PLATE_PROVISIONAL_LOOKUP_CONFIDENCE = Number(process.env.UK_PLATE_PROVISIONAL_LOOKUP_CONFIDENCE || 0.65);
const UK_OCR_STATUS_LOOKUP_MAX = Math.max(1, Number(process.env.UK_OCR_STATUS_LOOKUP_MAX || 2));
const UK_PLATE_OCR_OPENAI_MODEL = envValue("UK_PLATE_OCR_OPENAI_MODEL", "gpt-4.1-mini");
const BETA_STRICT_MODE = String(process.env.BETA_STRICT_MODE || "1") !== "0";
const ACCURACY_STRICT_MODE = String(process.env.ACCURACY_STRICT_MODE || "0") !== "0";
const PAID_ACCESS_MODE_RAW = envValue("PAID_ACCESS_MODE", "open").toLowerCase();
const PAID_ACCESS_MODE = ["open", "token", "locked"].includes(PAID_ACCESS_MODE_RAW)
  ? PAID_ACCESS_MODE_RAW
  : "open";
const PAID_ACCESS_TOKEN = envValue("PAID_ACCESS_TOKEN", "");
const PAID_ACCESS_HEADER = envValue("PAID_ACCESS_HEADER", "x-valuevision-paid-token").toLowerCase();
const ENFORCE_PAID_ACCESS_FOR_VEHICLE_DATA =
  String(process.env.ENFORCE_PAID_ACCESS_FOR_VEHICLE_DATA || "1") !== "0";
const PAID_ACCESS_USAGE_FILE = envValue("PAID_ACCESS_USAGE_FILE", "./data/paid-access-usage.json");

function boolFromAny(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function extractBearerToken(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = raw.match(/^bearer\s+(.+)$/i);
  return match?.[1] ? String(match[1]).trim() : "";
}

function getPaidAccessTokenFromRequest(req) {
  if (!req) return "";
  const fromNamedHeader = String(req.get(PAID_ACCESS_HEADER) || "").trim();
  if (fromNamedHeader) return fromNamedHeader;
  const fromDefaultHeader = String(req.get("x-valuevision-paid-token") || "").trim();
  if (fromDefaultHeader) return fromDefaultHeader;
  const fromLegacyHeader = String(req.get("x-paid-token") || "").trim();
  if (fromLegacyHeader) return fromLegacyHeader;
  const bearer = extractBearerToken(req.get("authorization"));
  if (bearer) return bearer;
  return "";
}

function evaluatePaidAccess(req, { featureLabel = "This feature" } = {}) {
  const mode = PAID_ACCESS_MODE;
  const requestPaidFlag =
    boolFromAny(req?.body?.paidAccess) ||
    boolFromAny(req?.body?.paid) ||
    boolFromAny(req?.query?.paidAccess) ||
    boolFromAny(req?.query?.paid);
  const token = getPaidAccessTokenFromRequest(req);
  const tokenValid = Boolean(PAID_ACCESS_TOKEN) && Boolean(token) && token === PAID_ACCESS_TOKEN;

  if (mode === "open") {
    return {
      allow: true,
      code: null,
      status: 200,
      mode,
      message: null,
      tokenValid,
      requestPaidFlag,
    };
  }
  if (tokenValid) {
    return {
      allow: true,
      code: null,
      status: 200,
      mode,
      message: null,
      tokenValid: true,
      requestPaidFlag,
    };
  }
  if (mode === "locked") {
    return {
      allow: false,
      code: "paid_feature_locked",
      status: 402,
      mode,
      message: `${featureLabel} is currently locked. No paid provider calls were made.`,
      tokenValid: false,
      requestPaidFlag,
    };
  }
  return {
    allow: false,
    code: "paid_access_required",
    status: 402,
    mode,
    message: `${featureLabel} requires paid access. No paid provider calls were made.`,
    tokenValid: false,
    requestPaidFlag,
  };
}

function paidAccessPolicySummary() {
  return {
    mode: PAID_ACCESS_MODE,
    header: PAID_ACCESS_HEADER,
    tokenConfigured: Boolean(PAID_ACCESS_TOKEN),
    enforceVehicleData: ENFORCE_PAID_ACCESS_FOR_VEHICLE_DATA,
  };
}

function extractEbayAccessToken(rawToken) {
  const raw = String(rawToken || "").trim();
  if (!raw) return "";
  // eBay OAuth tokens are typically provided in the full v^1.1#... format.
  // Use the raw token exactly as provided unless a custom short token was supplied.
  if (raw.startsWith("v^")) return raw;
  return raw;
}

function ebayApiBaseUrl() {
  return EBAY_ENV === "sandbox" ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";
}

async function fetchEbayAppAccessTokenFromCredentials() {
  if (!EBAY_CLIENT_ID || !EBAY_CLIENT_SECRET) {
    return { ok: false, error: "Missing EBAY_CLIENT_ID or EBAY_CLIENT_SECRET in backend/.env." };
  }
  const basic = Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString("base64");
  const body = "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7000);
  try {
    const url = `${ebayApiBaseUrl()}/identity/v1/oauth2/token`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basic}`,
      },
      body,
      signal: controller.signal,
    });
    const text = await resp.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    if (!resp.ok || !json?.access_token) {
      return {
        ok: false,
        error: `Failed to get eBay app token (${resp.status}).`,
        details: json || text,
      };
    }
    return { ok: true, accessToken: String(json.access_token) };
  } catch (err) {
    if (err?.name === "AbortError") return { ok: false, error: "eBay token request timed out." };
    return { ok: false, error: `eBay token request failed: ${String(err?.message || err)}` };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchEbayBrowseSearch(query, { limit = 10, marketplaceId = EBAY_MARKETPLACE_ID } = {}) {
  const q = String(query || "").trim();
  if (!q) return { ok: false, error: "Query is required." };

  const rawConfiguredToken = String(EBAY_APP_TOKEN_RAW || "").trim();
  const preloadedToken = extractEbayAccessToken(rawConfiguredToken);
  let accessToken = preloadedToken;
  if (!accessToken) {
    const tokenRes = await fetchEbayAppAccessTokenFromCredentials();
    if (!tokenRes.ok) return tokenRes;
    accessToken = tokenRes.accessToken;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const safeLimit = Math.max(1, Math.min(50, Number(limit) || 10));
    const url = `${ebayApiBaseUrl()}/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&limit=${safeLimit}`;
    const candidateTokens = [accessToken];
    if (rawConfiguredToken.includes("#t^")) {
      const short = rawConfiguredToken.split("#t^").pop().trim();
      if (short && short !== accessToken) candidateTokens.push(short);
    }

    let json = null;
    let lastFailure = null;
    for (const token of candidateTokens) {
      const resp = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-EBAY-C-MARKETPLACE-ID": marketplaceId,
        },
        signal: controller.signal,
      });
      const text = await resp.text();
      let parsed = null;
      try { parsed = text ? JSON.parse(text) : null; } catch {}
      if (resp.ok) {
        json = parsed;
        lastFailure = null;
        break;
      }
      lastFailure = {
        ok: false,
        error: `eBay Browse API error (${resp.status}).`,
        details: parsed || text,
      };
    }
    if (!json) return lastFailure || { ok: false, error: "eBay Browse API failed." };

    const items = Array.isArray(json?.itemSummaries) ? json.itemSummaries : [];
    const normalized = items.map((item) => ({
      title: item?.title || null,
      itemId: item?.itemId || null,
      itemWebUrl: item?.itemWebUrl || null,
      condition: item?.condition || null,
      imageUrl: item?.image?.imageUrl || null,
      currency: item?.price?.currency || null,
      value: item?.price?.value != null ? Number(item.price.value) : null,
      seller: item?.seller?.username || null,
      location: item?.itemLocation?.country || null,
    }));
    return {
      ok: true,
      count: normalized.length,
      source: `eBay Browse API (${marketplaceId})`,
      rows: normalized,
      rawTotal: json?.total || null,
      query: q,
    };
  } catch (err) {
    if (err?.name === "AbortError") return { ok: false, error: "eBay Browse request timed out." };
    return { ok: false, error: `eBay Browse request failed: ${String(err?.message || err)}` };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchEbayFindingSearch(query, { limit = 10, marketplaceId = EBAY_MARKETPLACE_ID } = {}) {
  const q = String(query || "").trim();
  if (!q) return { ok: false, error: "Query is required." };
  if (!EBAY_FINDING_APP_ID) {
    return { ok: false, error: "Missing EBAY_FINDING_APP_ID (or EBAY_CLIENT_ID) in backend/.env." };
  }

  const globalByMarketplace = {
    EBAY_GB: "EBAY-GB",
    EBAY_US: "EBAY-US",
    EBAY_DE: "EBAY-DE",
    EBAY_FR: "EBAY-FR",
    EBAY_IT: "EBAY-IT",
    EBAY_ES: "EBAY-ES",
    EBAY_AU: "EBAY-AU",
    EBAY_CA: "EBAY-ENCA",
  };
  const globalId = globalByMarketplace[String(marketplaceId || "").toUpperCase()] || "EBAY-GB";
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 10));
  const findingBase = EBAY_ENV === "sandbox"
    ? "https://svcs.sandbox.ebay.com/services/search/FindingService/v1"
    : "https://svcs.ebay.com/services/search/FindingService/v1";
  const endpoint = new URL(findingBase);
  endpoint.searchParams.set("OPERATION-NAME", "findItemsByKeywords");
  endpoint.searchParams.set("SERVICE-VERSION", "1.13.0");
  endpoint.searchParams.set("SECURITY-APPNAME", EBAY_FINDING_APP_ID);
  endpoint.searchParams.set("RESPONSE-DATA-FORMAT", "JSON");
  endpoint.searchParams.set("REST-PAYLOAD", "");
  endpoint.searchParams.set("GLOBAL-ID", globalId);
  endpoint.searchParams.set("keywords", q);
  endpoint.searchParams.set("paginationInput.entriesPerPage", String(safeLimit));
  endpoint.searchParams.set("itemFilter(0).name", "ListingType");
  endpoint.searchParams.set("itemFilter(0).value(0)", "FixedPrice");
  endpoint.searchParams.set("sortOrder", "BestMatch");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const resp = await fetch(endpoint.toString(), { method: "GET", signal: controller.signal });
    const text = await resp.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    if (!resp.ok) {
      return { ok: false, error: `eBay Finding API error (${resp.status}).`, details: json || text };
    }

    const root = json?.findItemsByKeywordsResponse?.[0];
    const ack = String(root?.ack?.[0] || "").toLowerCase();
    if (ack !== "success" && ack !== "warning") {
      return {
        ok: false,
        error: "eBay Finding API returned non-success response.",
        details: root?.errorMessage || root || json,
      };
    }

    const items = Array.isArray(root?.searchResult?.[0]?.item) ? root.searchResult[0].item : [];
    const rows = items.map((item) => {
      const price = item?.sellingStatus?.[0]?.currentPrice?.[0];
      return {
        title: item?.title?.[0] || null,
        itemId: item?.itemId?.[0] || null,
        itemWebUrl: item?.viewItemURL?.[0] || null,
        condition: item?.condition?.[0]?.conditionDisplayName?.[0] || null,
        imageUrl: item?.galleryURL?.[0] || null,
        currency: price?.["@currencyId"] || null,
        value: price?.["__value__"] != null ? Number(price.__value__) : null,
        seller: item?.sellerInfo?.[0]?.sellerUserName?.[0] || null,
        location: item?.location?.[0] || null,
      };
    });

    return {
      ok: true,
      count: rows.length,
      source: `eBay Finding API (${globalId})`,
      rows,
      query: q,
      rawTotal: Number(root?.paginationOutput?.[0]?.totalEntries?.[0] || rows.length) || rows.length,
    };
  } catch (err) {
    if (err?.name === "AbortError") return { ok: false, error: "eBay Finding request timed out." };
    return { ok: false, error: `eBay Finding request failed: ${String(err?.message || err)}` };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchEbaySearch(query, options = {}) {
  if (EBAY_FORCE_FINDING) {
    return fetchEbayFindingSearch(query, options);
  }
  const browse = await fetchEbayBrowseSearch(query, options);
  if (browse.ok) return browse;
  const browseErrorText = [
    String(browse?.error || ""),
    String(browse?.details?.message || ""),
    String(browse?.details?.longMessage || ""),
    JSON.stringify(browse?.details || {}),
  ]
    .join(" ")
    .toLowerCase();
  const shouldFallbackToFinding =
    browseErrorText.includes("invalid access token") ||
    browseErrorText.includes("missing ebay_client_id") ||
    browseErrorText.includes("oauth") ||
    browseErrorText.includes("(401)");
  if (!shouldFallbackToFinding) {
    return browse;
  }
  const finding = await fetchEbayFindingSearch(query, options);
  if (finding.ok) {
    return {
      ...finding,
      fallbackFrom: browse.error,
    };
  }
  return {
    ok: false,
    error: "Both eBay Browse and Finding API failed.",
    details: {
      browse,
      finding,
    },
  };
}

function normalizeUkReg(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function looksLikeUkRegistration(value) {
  const reg = normalizeUkReg(value);
  if (!reg) return false;
  // Current UK format (e.g. EO51LGA)
  if (/^[A-Z]{2}\d{2}[A-Z]{3}$/.test(reg)) return true;
  // Prefix/suffix historical styles
  if (/^[A-Z]\d{1,3}[A-Z]{3}$/.test(reg)) return true;
  if (/^[A-Z]{3}\d{1,3}[A-Z]$/.test(reg)) return true;
  return false;
}

function looksLikeModernUkRegistration(value) {
  return /^[A-Z]{2}\d{2}[A-Z]{3}$/.test(normalizeUkReg(value));
}

function extractUkRegFromText(text) {
  const lines = String(text || "")
    .toUpperCase()
    .split(/\s+/)
    .map((x) => normalizeUkReg(x))
    .filter(Boolean);
  for (const token of lines) {
    if (looksLikeUkRegistration(token)) return token;
  }

  // Fallback: search in the full string with optional spaces.
  const compactReg = extractUkRegFromCompact(text || "");
  if (compactReg) return compactReg;
  return null;
}

function extractUkRegFromCompact(compactText) {
  const compact = normalizeUkReg(compactText || "");
  if (!compact) return null;

  // Exact pattern search first.
  const patterns = [
    /([A-Z]{2}\d{2}[A-Z]{3})/,
    /([A-Z]\d{1,3}[A-Z]{3})/,
    /([A-Z]{3}\d{1,3}[A-Z])/,
  ];
  for (const re of patterns) {
    const m = compact.match(re);
    if (m && looksLikeUkRegistration(m[1])) return m[1];
  }

  // OCR fallback: sliding windows + common char substitutions.
  for (let len = 8; len >= 5; len -= 1) {
    for (let i = 0; i + len <= compact.length; i += 1) {
      const raw = compact.slice(i, i + len);
      const fixed = normalizeLikelyUkReg(raw);
      if (fixed) return fixed;
    }
  }
  return null;
}

function generateUkRegCandidates(token) {
  const raw = normalizeUkReg(token);
  if (!raw) return [];
  const substitutionMap = {
    O: ["0"],
    Q: ["0"],
    I: ["1"],
    L: ["1"],
    Z: ["2"],
    S: ["5"],
    N: ["W", "M"],
    W: ["N", "M"],
    M: ["N", "W"],
    B: ["8"],
    G: ["6"],
    0: ["O", "Q"],
    1: ["I", "L"],
    2: ["Z"],
    5: ["S"],
    6: ["G"],
    8: ["B"],
  };
  const out = new Set([raw]);
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    const alts = substitutionMap[ch] || [];
    for (const alt of alts) {
      const candidate = `${raw.slice(0, i)}${alt}${raw.slice(i + 1)}`;
      out.add(candidate);
    }
  }
  return Array.from(out);
}

function generateUkRegRetryCandidates(registrationNumber) {
  const raw = normalizeUkReg(registrationNumber);
  if (!raw || !looksLikeUkRegistration(raw)) return [];
  const firstPass = generateUkRegCandidates(raw);
  const secondPass = firstPass.flatMap((c) => generateUkRegCandidates(c));
  const uniqueCandidates = unique([raw, ...firstPass, ...secondPass])
    .map((x) => normalizeUkReg(x))
    .filter((x) => looksLikeUkRegistration(x));
  return uniqueCandidates.filter((x) => x !== raw).slice(0, 8);
}

function normalizeLikelyUkReg(token) {
  const candidates = generateUkRegCandidates(token);
  for (const candidate of candidates) {
    if (looksLikeUkRegistration(candidate)) return candidate;
  }
  return null;
}

function extractUkRegFromTokenList(tokens) {
  const cleaned = (tokens || []).map((t) => normalizeUkReg(t)).filter(Boolean);

  for (const token of cleaned) {
    const reg = normalizeLikelyUkReg(token);
    if (reg) return reg;
  }

  // Common OCR split: front/back plates often come as two adjacent chunks.
  for (let i = 0; i < cleaned.length; i += 1) {
    for (let j = i; j < Math.min(cleaned.length, i + 3); j += 1) {
      const merged = cleaned.slice(i, j + 1).join("");
      const reg = normalizeLikelyUkReg(merged);
      if (reg) return reg;
    }
  }

  // Global compact fallback across all OCR tokens.
  const compactReg = extractUkRegFromCompact(cleaned.join(""));
  if (compactReg) return compactReg;

  return null;
}

function scoreUkRegCandidateMap(candidateMap, rawCandidate, score, reason) {
  const reg = normalizeUkReg(rawCandidate);
  if (!looksLikeUkRegistration(reg)) return;
  const current = candidateMap.get(reg) || { reg, score: 0, hits: 0, reasons: [] };
  current.score += score;
  current.hits += 1;
  if (reason && current.reasons.length < 5) current.reasons.push(reason);
  candidateMap.set(reg, current);
}

function buildUkRegCandidateRanking(text, tokenList, weight = 1) {
  const candidateMap = new Map();
  const cleaned = (tokenList || []).map((t) => normalizeUkReg(t)).filter(Boolean);
  for (const token of cleaned) {
    if (looksLikeUkRegistration(token)) {
      scoreUkRegCandidateMap(candidateMap, token, 1.25 * weight, "token_exact");
    }
    const normalized = normalizeLikelyUkReg(token);
    if (normalized) {
      scoreUkRegCandidateMap(candidateMap, normalized, 1.0 * weight, "token_normalized");
    }
  }
  for (let i = 0; i < cleaned.length; i += 1) {
    for (let j = i; j < Math.min(cleaned.length, i + 3); j += 1) {
      const merged = cleaned.slice(i, j + 1).join("");
      const normalized = normalizeLikelyUkReg(merged);
      if (normalized) {
        scoreUkRegCandidateMap(candidateMap, normalized, 0.6 * weight, "merged_token_window");
      }
    }
  }
  const compactReg = extractUkRegFromCompact(text || "");
  if (compactReg) {
    scoreUkRegCandidateMap(candidateMap, compactReg, 0.85 * weight, "compact_match");
  }

  const ranked = Array.from(candidateMap.values()).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.hits !== a.hits) return b.hits - a.hits;
    return b.reg.length - a.reg.length;
  });
  return ranked;
}

function finalizeUkRegConfidence(rankedCandidates) {
  if (!rankedCandidates.length) {
    return {
      ok: false,
      registrationNumber: null,
      confidence: 0,
      highConfidence: false,
      ambiguous: false,
      candidates: [],
      error: "No UK registration detected in image.",
    };
  }

  const best = rankedCandidates[0];
  const second = rankedCandidates[1] || null;
  const margin = second ? best.score - second.score : best.score;
  const normalizedScore = Math.min(1, best.score / 2.4);
  const normalizedMargin = Math.min(1, margin / 1.2);
  const confidence = Number((normalizedScore * 0.7 + normalizedMargin * 0.3).toFixed(3));
  const ambiguous = Boolean(second) && margin < 0.4;
  const highConfidence = confidence >= UK_PLATE_AUTO_ACCEPT_CONFIDENCE && !ambiguous;

  return {
    ok: true,
    registrationNumber: best.reg,
    confidence,
    highConfidence,
    ambiguous,
    candidates: rankedCandidates.slice(0, 5).map((c) => ({
      registrationNumber: c.reg,
      score: Number(c.score.toFixed(3)),
      hits: c.hits,
      reasons: c.reasons,
    })),
  };
}
const VEHICLE_MAKES = [
  "range rover", "land rover", "toyota", "honda", "ford", "bmw", "audi", "mercedes",
  "nissan", "hyundai", "kia", "volkswagen", "vw", "mazda", "lexus", "jaguar",
  "porsche", "tesla", "chevrolet", "chevy", "gmc", "jeep", "subaru", "volvo",
];
const VEHICLE_MODELS = [
  "defender", "discovery", "evoque", "sport", "civic", "accord", "camry", "corolla",
  "rav4", "focus", "fiesta", "mustang", "f150", "x5", "x3", "3 series", "5 series",
  "a3", "a4", "q5", "q7", "c class", "e class", "golf", "polo", "tiguan", "model 3",
  "model y", "wrangler", "cherokee", "outback", "cx5", "rx", "macan", "cayenne",
];

function detectVehicleMakeHint(text) {
  const normalized = normalizeText(text || "");
  if (!normalized) return null;
  const ordered = [...VEHICLE_MAKES].sort((a, b) => b.length - a.length);
  for (const make of ordered) {
    if (normalized.includes(normalizeText(make))) return make;
  }
  return null;
}

function normalizeMakeName(value) {
  return normalizeText(String(value || "")).replace(/\s+/g, " ").trim();
}

function selectBestUkStatusCandidate(candidates, makeHint) {
  if (!candidates.length) return { best: null, ambiguous: false, all: [] };
  const hint = normalizeMakeName(makeHint || "");
  const scored = candidates.map((c) => {
    let score = 0;
    const make = normalizeMakeName(c?.status?.make || "");
    if (hint && make && make.includes(hint)) score += 5;
    // Mild preference for original OCR candidate when no better signal exists.
    if (c.isOriginal) score += 1;
    return { ...c, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const second = scored[1];
  const ambiguous = Boolean(second) && best.score - second.score <= 1;
  return { best, ambiguous, all: scored };
}
let visionClient = null;
let visionInitFailed = false;
const pricingCache = new Map();
let outcomeStore = null;
let carSoldCompsCache = null;
let carSoldCompsLoadedAt = null;
let manualSoldCompsCache = null;
let manualSoldCompsLoadedAt = null;
let ukValuationCacheStore = null;
let ukStatusCacheStore = null;
let ukModelBaselineStore = null;
let checkcarUsageStore = null;
let paidAccessUsageStore = null;

function getVisionClient() {
  if (visionClient) return visionClient;
  if (visionInitFailed) return null;
  try {
    visionClient = new vision.ImageAnnotatorClient();
    return visionClient;
  } catch {
    visionInitFailed = true;
    return null;
  }
}

function loadOutcomeStore() {
  if (outcomeStore) return outcomeStore;
  try {
    // Lazy load to avoid fs use until needed.
    const fs = require("fs");
    if (fs.existsSync(OUTCOME_FILE)) {
      outcomeStore = JSON.parse(fs.readFileSync(OUTCOME_FILE, "utf8"));
    } else {
      outcomeStore = { outcomes: [], calibration: {}, priors: {} };
    }
  } catch {
    outcomeStore = { outcomes: [], calibration: {}, priors: {} };
  }
  if (!outcomeStore.priors) outcomeStore.priors = {};
  return outcomeStore;
}

function saveOutcomeStore() {
  try {
    const fs = require("fs");
    fs.writeFileSync(OUTCOME_FILE, JSON.stringify(outcomeStore, null, 2));
  } catch {}
}

function utcDayKey(tsMs = Date.now()) {
  try {
    return new Date(tsMs).toISOString().slice(0, 10);
  } catch {
    return String(new Date().toISOString()).slice(0, 10);
  }
}

function loadCheckcarUsageStore() {
  if (checkcarUsageStore) return checkcarUsageStore;
  try {
    if (fs.existsSync(CHECKCAR_USAGE_FILE)) {
      const raw = fs.readFileSync(CHECKCAR_USAGE_FILE, "utf8");
      const parsed = raw ? JSON.parse(raw) : {};
      const days = parsed?.days && typeof parsed.days === "object" ? parsed.days : {};
      checkcarUsageStore = { days };
    } else {
      checkcarUsageStore = { days: {} };
    }
  } catch {
    checkcarUsageStore = { days: {} };
  }
  return checkcarUsageStore;
}

function saveCheckcarUsageStore() {
  try {
    if (!checkcarUsageStore) return;
    const dir = path.dirname(CHECKCAR_USAGE_FILE);
    if (dir && dir !== ".") fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      CHECKCAR_USAGE_FILE,
      JSON.stringify(
        {
          updatedAt: new Date().toISOString(),
          days: checkcarUsageStore.days || {},
        },
        null,
        2
      )
    );
  } catch {}
}

function getCheckcarUsageSnapshot() {
  const store = loadCheckcarUsageStore();
  const day = utcDayKey();
  const row = store?.days?.[day] || {};
  const total = Math.max(0, Number(row.total || 0));
  return {
    date: day,
    total,
    byEndpoint: {
      vehiclereg: Math.max(0, Number(row.vehiclereg || 0)),
      ukvehicledata: Math.max(0, Number(row.ukvehicledata || 0)),
      carhistory: Math.max(0, Number(row.carhistory || 0)),
      valuation: Math.max(0, Number(row.valuation || 0)),
    },
    limits: {
      soft: CHECKCAR_DAILY_SOFT_LIMIT,
      hard: CHECKCAR_DAILY_HARD_LIMIT,
      softActive: CHECKCAR_DAILY_SOFT_LIMIT > 0,
      hardActive: CHECKCAR_DAILY_HARD_LIMIT > 0,
    },
  };
}

function roundGbp(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function estimateCheckcarCostGbp(usage = getCheckcarUsageSnapshot()) {
  const byEndpoint = usage?.byEndpoint || {};
  const endpointCosts = {
    vehiclereg: roundGbp(Number(byEndpoint.vehiclereg || 0) * CHECKCAR_COST_PER_VEHICLEREG_GBP),
    ukvehicledata: roundGbp(Number(byEndpoint.ukvehicledata || 0) * CHECKCAR_COST_PER_UKVEHICLEDATA_GBP),
    carhistory: roundGbp(Number(byEndpoint.carhistory || 0) * CHECKCAR_COST_PER_CARHISTORY_GBP),
    valuation: roundGbp(Number(byEndpoint.valuation || 0) * CHECKCAR_COST_PER_VALUATION_GBP),
  };
  const totalGbp = roundGbp(
    endpointCosts.vehiclereg +
      endpointCosts.ukvehicledata +
      endpointCosts.carhistory +
      endpointCosts.valuation
  );
  const totalCalls =
    Number(byEndpoint.vehiclereg || 0) +
    Number(byEndpoint.ukvehicledata || 0) +
    Number(byEndpoint.carhistory || 0) +
    Number(byEndpoint.valuation || 0);
  const avgCostPerCallGbp = totalCalls > 0 ? roundGbp(totalGbp / totalCalls) : 0;
  return {
    currency: "GBP",
    totalGbp,
    avgCostPerCallGbp,
    endpointCostsGbp: endpointCosts,
    unitCostsGbp: {
      vehiclereg: CHECKCAR_COST_PER_VEHICLEREG_GBP,
      ukvehicledata: CHECKCAR_COST_PER_UKVEHICLEDATA_GBP,
      carhistory: CHECKCAR_COST_PER_CARHISTORY_GBP,
      valuation: CHECKCAR_COST_PER_VALUATION_GBP,
    },
  };
}

function incrementCheckcarUsage(endpoint, amount = 1) {
  const endpointKey = String(endpoint || "").trim().toLowerCase();
  if (!endpointKey || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    return getCheckcarUsageSnapshot();
  }
  const store = loadCheckcarUsageStore();
  const day = utcDayKey();
  if (!store.days[day] || typeof store.days[day] !== "object") {
    store.days[day] = { total: 0 };
  }
  const row = store.days[day];
  row.total = Math.max(0, Number(row.total || 0)) + Number(amount);
  row[endpointKey] = Math.max(0, Number(row[endpointKey] || 0)) + Number(amount);
  saveCheckcarUsageStore();
  return getCheckcarUsageSnapshot();
}

function loadPaidAccessUsageStore() {
  if (paidAccessUsageStore) return paidAccessUsageStore;
  try {
    if (fs.existsSync(PAID_ACCESS_USAGE_FILE)) {
      const raw = fs.readFileSync(PAID_ACCESS_USAGE_FILE, "utf8");
      const parsed = raw ? JSON.parse(raw) : {};
      const days = parsed?.days && typeof parsed.days === "object" ? parsed.days : {};
      paidAccessUsageStore = { days };
    } else {
      paidAccessUsageStore = { days: {} };
    }
  } catch {
    paidAccessUsageStore = { days: {} };
  }
  return paidAccessUsageStore;
}

function savePaidAccessUsageStore() {
  try {
    if (!paidAccessUsageStore) return;
    const dir = path.dirname(PAID_ACCESS_USAGE_FILE);
    if (dir && dir !== ".") fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      PAID_ACCESS_USAGE_FILE,
      JSON.stringify(
        {
          updatedAt: new Date().toISOString(),
          days: paidAccessUsageStore.days || {},
        },
        null,
        2
      )
    );
  } catch {}
}

function getPaidAccessUsageSnapshot() {
  const store = loadPaidAccessUsageStore();
  const day = utcDayKey();
  const row = store?.days?.[day] || {};
  return {
    date: day,
    total: Math.max(0, Number(row.total || 0)),
    byType: {
      blocked_vehicle_pricing: Math.max(0, Number(row.blocked_vehicle_pricing || 0)),
      blocked_fullcar_check: Math.max(0, Number(row.blocked_fullcar_check || 0)),
      allowed_vehicle_pricing: Math.max(0, Number(row.allowed_vehicle_pricing || 0)),
      allowed_fullcar_check: Math.max(0, Number(row.allowed_fullcar_check || 0)),
    },
  };
}

function incrementPaidAccessUsage(type, amount = 1) {
  const metric = String(type || "").trim().toLowerCase();
  if (!metric || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    return getPaidAccessUsageSnapshot();
  }
  const store = loadPaidAccessUsageStore();
  const day = utcDayKey();
  if (!store.days[day] || typeof store.days[day] !== "object") {
    store.days[day] = { total: 0 };
  }
  const row = store.days[day];
  row.total = Math.max(0, Number(row.total || 0)) + Number(amount);
  row[metric] = Math.max(0, Number(row[metric] || 0)) + Number(amount);
  savePaidAccessUsageStore();
  return getPaidAccessUsageSnapshot();
}

function checkcarBudgetDecision({ costTier = "primary" } = {}) {
  const usage = getCheckcarUsageSnapshot();
  const soft = Number(CHECKCAR_DAILY_SOFT_LIMIT || 0);
  const hard = Number(CHECKCAR_DAILY_HARD_LIMIT || 0);
  const overSoft = soft > 0 && usage.total >= soft;
  const overHard = hard > 0 && usage.total >= hard;

  if (overHard && CHECKCAR_ENFORCE_HARD_LIMIT) {
    return {
      allow: false,
      code: "checkcar_daily_hard_limit_reached",
      message: `Daily CheckCar hard limit reached (${usage.total}/${hard}).`,
      usage,
      overSoft,
      overHard,
    };
  }
  if (overSoft && CHECKCAR_SKIP_ENRICH_AT_SOFT_LIMIT && costTier === "enrichment") {
    return {
      allow: false,
      code: "checkcar_daily_soft_limit_reached_enrichment_skipped",
      message: `Daily CheckCar soft limit reached (${usage.total}/${soft}); enrichment lookup skipped.`,
      usage,
      overSoft,
      overHard,
    };
  }
  return {
    allow: true,
    code: null,
    message: null,
    usage,
    overSoft,
    overHard,
  };
}

function loadUkValuationCacheStore() {
  if (ukValuationCacheStore) return ukValuationCacheStore;
  try {
    if (fs.existsSync(UK_VALUATION_CACHE_FILE)) {
      const raw = fs.readFileSync(UK_VALUATION_CACHE_FILE, "utf8");
      const parsed = raw ? JSON.parse(raw) : {};
      const entriesSource = parsed?.entries && typeof parsed.entries === "object"
        ? parsed.entries
        : parsed;
      const entries = {};
      for (const [rawReg, rawEntry] of Object.entries(entriesSource || {})) {
        const reg = normalizeUkReg(rawReg);
        const summary = rawEntry?.summary || null;
        const median = Number(summary?.median || 0);
        const savedAtMs = Number(rawEntry?.savedAtMs || Date.parse(rawEntry?.savedAt || ""));
        if (!reg || !Number.isFinite(median) || median <= 0 || !Number.isFinite(savedAtMs) || savedAtMs <= 0) {
          continue;
        }
        entries[reg] = {
          summary,
          savedAtMs,
          savedAt: rawEntry?.savedAt || new Date(savedAtMs).toISOString(),
          source: rawEntry?.source || summary?.source || "checkcardetails-valuation",
        };
      }
      ukValuationCacheStore = { entries };
    } else {
      ukValuationCacheStore = { entries: {} };
    }
  } catch {
    ukValuationCacheStore = { entries: {} };
  }
  return ukValuationCacheStore;
}

function saveUkValuationCacheStore() {
  try {
    if (!ukValuationCacheStore) return;
    const dir = path.dirname(UK_VALUATION_CACHE_FILE);
    if (dir && dir !== ".") fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      UK_VALUATION_CACHE_FILE,
      JSON.stringify(
        {
          updatedAt: new Date().toISOString(),
          entries: ukValuationCacheStore.entries || {},
        },
        null,
        2
      )
    );
  } catch {}
}

function getCachedUkValuationSummary(registrationNumber, { allowStale = false } = {}) {
  const reg = normalizeUkReg(registrationNumber);
  if (!reg) return null;
  const store = loadUkValuationCacheStore();
  const entry = store?.entries?.[reg];
  if (!entry?.summary) return null;
  const savedAtMs = Number(entry.savedAtMs || 0);
  if (!Number.isFinite(savedAtMs) || savedAtMs <= 0) return null;
  const ageMs = Date.now() - savedAtMs;
  if (ageMs <= UK_VALUATION_CACHE_TTL_MS) {
    return {
      summary: { ...entry.summary, source: entry.summary?.source || entry.source || "checkcardetails-valuation" },
      stale: false,
      ageMs,
      savedAt: entry.savedAt || null,
    };
  }
  if (allowStale && ageMs <= UK_VALUATION_CACHE_STALE_TTL_MS) {
    return {
      summary: {
        ...entry.summary,
        source: entry.summary?.source || entry.source || "checkcardetails-valuation-cache-stale",
      },
      stale: true,
      ageMs,
      savedAt: entry.savedAt || null,
    };
  }
  if (ageMs > UK_VALUATION_CACHE_STALE_TTL_MS) {
    delete store.entries[reg];
    saveUkValuationCacheStore();
  }
  return null;
}

function setCachedUkValuationSummary(registrationNumber, summary) {
  const reg = normalizeUkReg(registrationNumber);
  const median = Number(summary?.median || 0);
  if (!reg || !Number.isFinite(median) || median <= 0) return;
  const store = loadUkValuationCacheStore();
  store.entries[reg] = {
    summary: { ...summary, source: summary?.source || "checkcardetails-valuation" },
    savedAtMs: Date.now(),
    savedAt: new Date().toISOString(),
    source: summary?.source || "checkcardetails-valuation",
  };

  const regs = Object.keys(store.entries);
  if (regs.length > UK_VALUATION_CACHE_MAX_ENTRIES) {
    const overflow = regs.length - UK_VALUATION_CACHE_MAX_ENTRIES;
    const orderedOldestFirst = regs
      .map((key) => ({ key, savedAtMs: Number(store.entries[key]?.savedAtMs || 0) }))
      .sort((a, b) => a.savedAtMs - b.savedAtMs);
    for (let i = 0; i < overflow; i += 1) {
      const old = orderedOldestFirst[i];
      if (old?.key) delete store.entries[old.key];
    }
  }
  saveUkValuationCacheStore();
}

function loadUkStatusCacheStore() {
  if (ukStatusCacheStore) return ukStatusCacheStore;
  try {
    if (fs.existsSync(UK_STATUS_CACHE_FILE)) {
      const raw = fs.readFileSync(UK_STATUS_CACHE_FILE, "utf8");
      const parsed = raw ? JSON.parse(raw) : {};
      const entriesSource = parsed?.entries && typeof parsed.entries === "object"
        ? parsed.entries
        : parsed;
      const entries = {};
      for (const [rawReg, rawEntry] of Object.entries(entriesSource || {})) {
        const reg = normalizeUkReg(rawReg);
        const savedAtMs = Number(rawEntry?.savedAtMs || Date.parse(rawEntry?.savedAt || ""));
        if (!reg || !Number.isFinite(savedAtMs) || savedAtMs <= 0) continue;
        const status = rawEntry?.status;
        if (!status || typeof status !== "object" || status.ok !== true) continue;
        entries[reg] = {
          status,
          savedAtMs,
          savedAt: rawEntry?.savedAt || new Date(savedAtMs).toISOString(),
        };
      }
      ukStatusCacheStore = { entries };
    } else {
      ukStatusCacheStore = { entries: {} };
    }
  } catch {
    ukStatusCacheStore = { entries: {} };
  }
  return ukStatusCacheStore;
}

function saveUkStatusCacheStore() {
  try {
    if (!ukStatusCacheStore) return;
    const dir = path.dirname(UK_STATUS_CACHE_FILE);
    if (dir && dir !== ".") fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      UK_STATUS_CACHE_FILE,
      JSON.stringify(
        {
          updatedAt: new Date().toISOString(),
          entries: ukStatusCacheStore.entries || {},
        },
        null,
        2
      )
    );
  } catch {}
}

function getCachedUkStatus(registrationNumber, { allowStale = false } = {}) {
  const reg = normalizeUkReg(registrationNumber);
  if (!reg) return null;
  const store = loadUkStatusCacheStore();
  const entry = store?.entries?.[reg];
  if (!entry?.status || entry.status.ok !== true) return null;
  const savedAtMs = Number(entry.savedAtMs || 0);
  if (!Number.isFinite(savedAtMs) || savedAtMs <= 0) return null;
  const ageMs = Date.now() - savedAtMs;
  const buildPayload = (stale) => ({
    status: {
      ...entry.status,
      checkedAt: entry.status?.checkedAt || entry.savedAt || new Date(savedAtMs).toISOString(),
      source: entry.status?.source || "CheckCarDetails API",
      cache: {
        hit: true,
        stale: Boolean(stale),
        ageSec: Math.round(ageMs / 1000),
      },
    },
    stale: Boolean(stale),
    ageMs,
    savedAt: entry.savedAt || null,
  });
  if (ageMs <= UK_STATUS_CACHE_TTL_MS) return buildPayload(false);
  if (allowStale && ageMs <= UK_STATUS_CACHE_STALE_TTL_MS) return buildPayload(true);
  if (ageMs > UK_STATUS_CACHE_STALE_TTL_MS) {
    delete store.entries[reg];
    saveUkStatusCacheStore();
  }
  return null;
}

function setCachedUkStatus(registrationNumber, status) {
  const reg = normalizeUkReg(registrationNumber);
  if (!reg || !status || status.ok !== true) return;
  const store = loadUkStatusCacheStore();
  store.entries[reg] = {
    status: {
      ...status,
      checkedAt: status?.checkedAt || new Date().toISOString(),
      source: status?.source || "CheckCarDetails API",
    },
    savedAtMs: Date.now(),
    savedAt: new Date().toISOString(),
  };

  const regs = Object.keys(store.entries);
  if (regs.length > UK_STATUS_CACHE_MAX_ENTRIES) {
    const overflow = regs.length - UK_STATUS_CACHE_MAX_ENTRIES;
    const orderedOldestFirst = regs
      .map((key) => ({ key, savedAtMs: Number(store.entries[key]?.savedAtMs || 0) }))
      .sort((a, b) => a.savedAtMs - b.savedAtMs);
    for (let i = 0; i < overflow; i += 1) {
      const old = orderedOldestFirst[i];
      if (old?.key) delete store.entries[old.key];
    }
  }
  saveUkStatusCacheStore();
}

function ukModelBaselineKey({ make, model, year }) {
  const makeNorm = normalizeCarText(make);
  const modelNorm = normalizeCarText(model);
  const y = Number.isFinite(Number(year)) ? String(Number(year)) : "na";
  if (!makeNorm || !modelNorm) return null;
  return `${makeNorm}|${modelNorm}|${y}`;
}

function loadUkModelBaselineStore() {
  if (ukModelBaselineStore) return ukModelBaselineStore;
  try {
    if (fs.existsSync(UK_MODEL_BASELINE_FILE)) {
      const raw = fs.readFileSync(UK_MODEL_BASELINE_FILE, "utf8");
      const parsed = raw ? JSON.parse(raw) : {};
      const entries = parsed?.entries && typeof parsed.entries === "object" ? parsed.entries : {};
      ukModelBaselineStore = { entries };
    } else {
      ukModelBaselineStore = { entries: {} };
    }
  } catch {
    ukModelBaselineStore = { entries: {} };
  }
  return ukModelBaselineStore;
}

function saveUkModelBaselineStore() {
  try {
    if (!ukModelBaselineStore) return;
    const dir = path.dirname(UK_MODEL_BASELINE_FILE);
    if (dir && dir !== ".") fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      UK_MODEL_BASELINE_FILE,
      JSON.stringify(
        {
          updatedAt: new Date().toISOString(),
          entries: ukModelBaselineStore.entries || {},
        },
        null,
        2
      )
    );
  } catch {}
}

function getUkModelBaselineSummary({ make, model, year }) {
  const store = loadUkModelBaselineStore();
  const makeNorm = normalizeCarText(make);
  const modelNorm = normalizeCarText(model);
  if (!makeNorm || !modelNorm) return null;

  const yearNum = Number.isFinite(Number(year)) ? Number(year) : null;
  const entries = Object.values(store.entries || {}).filter((entry) => {
    if (!entry) return false;
    if (normalizeCarText(entry.makeNorm || entry.make) !== makeNorm) return false;
    if (normalizeCarText(entry.modelNorm || entry.model) !== modelNorm) return false;
    return true;
  });
  if (!entries.length) return null;

  let best = null;
  let bestScore = -Infinity;
  for (const entry of entries) {
    const samples = Number(entry.samples || 0);
    const median = Number(entry.median || 0);
    if (!Number.isFinite(median) || median <= 0 || samples < 1) continue;
    const entryYear = Number.isFinite(Number(entry.year)) ? Number(entry.year) : null;
    const yearPenalty = yearNum != null && entryYear != null ? Math.abs(yearNum - entryYear) : 2;
    const score = samples * 12 - yearPenalty * 6;
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  if (!best) return null;
  const low = Number(best.low || 0);
  const median = Number(best.median || 0);
  const high = Number(best.high || 0);
  if (!Number.isFinite(median) || median <= 0) return null;
  return {
    count: Math.max(1, Number(best.samples || 0)),
    low: Number.isFinite(low) && low > 0 ? low : median * 0.86,
    median,
    high: Number.isFinite(high) && high > 0 ? high : median * 1.14,
    currency: "GBP",
    source: "uk-model-baseline",
    makeNorm: best.makeNorm || makeNorm,
    modelNorm: best.modelNorm || modelNorm,
    year: best.year || null,
    samples: Number(best.samples || 0),
    updatedAt: best.updatedAt || null,
  };
}

function updateUkModelBaselineSummary({ make, model, year, valuation }) {
  const key = ukModelBaselineKey({ make, model, year });
  if (!key) return;
  const median = Number(valuation?.median || 0);
  const low = Number(valuation?.low || 0);
  const high = Number(valuation?.high || 0);
  if (!Number.isFinite(median) || median <= 0) return;

  const store = loadUkModelBaselineStore();
  const prev = store.entries[key] || null;
  const prevSamples = Number(prev?.samples || 0);
  const samples = Math.min(5000, prevSamples + 1);
  const alpha = prevSamples > 30 ? 0.1 : prevSamples > 10 ? 0.16 : 0.24;
  const blend = (prevVal, nextVal) => {
    if (!Number.isFinite(Number(nextVal)) || Number(nextVal) <= 0) return Number(prevVal || 0);
    if (!Number.isFinite(Number(prevVal)) || Number(prevVal) <= 0) return Number(nextVal);
    return Number(prevVal) * (1 - alpha) + Number(nextVal) * alpha;
  };

  store.entries[key] = {
    makeNorm: normalizeCarText(make),
    modelNorm: normalizeCarText(model),
    year: Number.isFinite(Number(year)) ? Number(year) : null,
    median: blend(prev?.median, median),
    low: blend(prev?.low, low || median * 0.86),
    high: blend(prev?.high, high || median * 1.14),
    samples,
    updatedAt: new Date().toISOString(),
  };

  const keys = Object.keys(store.entries);
  if (keys.length > UK_MODEL_BASELINE_MAX_ENTRIES) {
    const overflow = keys.length - UK_MODEL_BASELINE_MAX_ENTRIES;
    const sorted = keys
      .map((k) => ({ k, updatedAt: Date.parse(store.entries[k]?.updatedAt || 0) || 0 }))
      .sort((a, b) => a.updatedAt - b.updatedAt);
    for (let i = 0; i < overflow; i += 1) {
      if (sorted[i]?.k) delete store.entries[sorted[i].k];
    }
  }
  saveUkModelBaselineStore();
}

function normalizeCarText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function parseCarSoldCompsFile() {
  if (carSoldCompsCache) return carSoldCompsCache;
  try {
    if (!fs.existsSync(CAR_SOLD_COMPS_FILE)) {
      carSoldCompsCache = [];
      carSoldCompsLoadedAt = null;
      return carSoldCompsCache;
    }
    const raw = fs.readFileSync(CAR_SOLD_COMPS_FILE, "utf8");
    const parsed = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .filter((x) => Number.isFinite(Number(x.price)) && Number(x.price) > 0)
      .map((x) => ({
        ...x,
        makeNorm: normalizeCarText(x.makeNorm || x.make || ""),
        modelNorm: normalizeCarText(x.modelNorm || x.model || ""),
        currencyNorm: String(x.currency || "").toUpperCase(),
        countryNorm: String(x.country || x.region || "").toUpperCase(),
        year: Number.isFinite(Number(x.year)) ? Number(x.year) : null,
        price: Number(x.price),
        odometerKm: Number.isFinite(Number(x.odometerKm)) ? Number(x.odometerKm) : null,
      }));
    carSoldCompsCache = parsed;
    carSoldCompsLoadedAt = new Date().toISOString();
  } catch {
    carSoldCompsCache = [];
    carSoldCompsLoadedAt = null;
  }
  return carSoldCompsCache;
}

function parseManualSoldCompsFile() {
  if (manualSoldCompsCache) return manualSoldCompsCache;
  try {
    if (!fs.existsSync(MANUAL_SOLD_COMPS_FILE)) {
      manualSoldCompsCache = [];
      manualSoldCompsLoadedAt = null;
      return manualSoldCompsCache;
    }
    const raw = fs.readFileSync(MANUAL_SOLD_COMPS_FILE, "utf8");
    manualSoldCompsCache = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .filter((x) => Number.isFinite(Number(x.soldPrice)) && Number(x.soldPrice) > 0)
      .map((x) => ({
        ...x,
        category: normalizeText(x.category || "general"),
        titleNorm: normalizeText(x.title || ""),
        brandNorm: normalizeText(x.brand || ""),
        modelNorm: normalizeText(x.model || ""),
        soldPrice: Number(x.soldPrice),
        year: Number.isFinite(Number(x.year)) ? Number(x.year) : null,
      }));
    manualSoldCompsLoadedAt = new Date().toISOString();
  } catch {
    manualSoldCompsCache = [];
    manualSoldCompsLoadedAt = null;
  }
  return manualSoldCompsCache;
}

function appendManualSoldComp(entry) {
  const dataDir = require("path").dirname(MANUAL_SOLD_COMPS_FILE);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.appendFileSync(MANUAL_SOLD_COMPS_FILE, `${JSON.stringify(entry)}\n`, "utf8");
  manualSoldCompsCache = null;
}

function parseCsvRow(line) {
  const out = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out.map((x) => String(x || "").trim());
}

function parseCsvText(csvText) {
  const lines = String(csvText || "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const headers = parseCsvRow(lines[0]).map((h) => normalizeText(h));
  const rows = [];
  for (const line of lines.slice(1)) {
    const cols = parseCsvRow(line);
    const row = {};
    for (let i = 0; i < headers.length; i += 1) {
      row[headers[i]] = cols[i] || "";
    }
    rows.push(row);
  }
  return rows;
}

function buildAccuracyDashboard({ days = 30 }) {
  const windowDays = Math.max(1, Number(days || 30));
  const sinceMs = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const store = loadOutcomeStore();
  const outcomes = (store?.outcomes || []).filter((o) => {
    const t = new Date(o.createdAt || 0).getTime();
    return Number.isFinite(t) && t >= sinceMs;
  });
  const byCategory = new Map();
  let totalAbsPct = 0;
  let totalRows = 0;
  for (const row of outcomes) {
    const predicted = Number(row.predictedMedian || 0);
    const actual = Number(row.soldPrice || 0);
    if (!Number.isFinite(predicted) || predicted <= 0 || !Number.isFinite(actual) || actual <= 0) continue;
    const absPct = Math.abs(predicted - actual) / actual * 100;
    totalAbsPct += absPct;
    totalRows += 1;
    const cat = String(row.category || "general").toLowerCase();
    const bucket = byCategory.get(cat) || { count: 0, absPctSum: 0 };
    bucket.count += 1;
    bucket.absPctSum += absPct;
    byCategory.set(cat, bucket);
  }
  const categoryMetrics = Array.from(byCategory.entries()).map(([category, b]) => ({
    category,
    samples: b.count,
    mapePct: Number((b.absPctSum / Math.max(1, b.count)).toFixed(2)),
  }));
  const manualCount = parseManualSoldCompsFile().length;
  const carCount = parseCarSoldCompsFile().length;
  return {
    windowDays,
    outcomesSamples: totalRows,
    mapePct: totalRows ? Number((totalAbsPct / totalRows).toFixed(2)) : null,
    categoryMetrics: categoryMetrics.sort((a, b) => b.samples - a.samples),
    soldCompsCoverage: {
      manual: manualCount,
      cars: carCount,
      total: manualCount + carCount,
    },
    updatedAt: new Date().toISOString(),
  };
}

function percentileFromSorted(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p)));
  return sorted[idx];
}

const FX_TO_GBP = {
  GBP: 1,
  USD: 0.79,
  EUR: 0.86,
  AUD: 0.52,
  CAD: 0.58,
};

function toTargetCurrency(price, fromCurrency, targetCurrency) {
  const value = Number(price);
  if (!Number.isFinite(value) || value <= 0) return null;
  const from = String(fromCurrency || "").toUpperCase();
  const target = String(targetCurrency || "").toUpperCase();
  if (!from || !target || from === target) return value;
  // Convert via GBP to keep the map small and predictable.
  const fromToGbp = FX_TO_GBP[from];
  const targetToGbp = FX_TO_GBP[target];
  if (!Number.isFinite(fromToGbp) || !Number.isFinite(targetToGbp) || targetToGbp <= 0) return null;
  const gbpValue = value * fromToGbp;
  return gbpValue / targetToGbp;
}

function vehicleVariantTokens(query, make, model) {
  const makeTokens = normalizeText(make || "").split(" ").filter(Boolean);
  const modelTokens = normalizeText(model || "").split(" ").filter(Boolean);
  const blocked = new Set([
    ...makeTokens,
    ...modelTokens,
    "used",
    "price",
    "value",
    "for",
    "sale",
    "car",
    "cars",
    "vehicle",
  ]);
  return normalizeText(query || "")
    .split(" ")
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !blocked.has(t))
    .filter((t) => !/^\d{4}$/.test(t))
    .filter((t) => !isVehicleNoiseToken(t))
    .filter((t) => t.length >= 2)
    .slice(0, 10);
}

function lookupCarSoldComps({ make, model, year, mileage, limit = 60, query = "", region = "uk" }) {
  const all = parseCarSoldCompsFile();
  const makeNorm = normalizeCarText(make);
  const modelNorm = normalizeCarText(model);
  if (!makeNorm || !modelNorm) return { comps: [], summary: null };
  const targetRegion = String(region || "uk").toLowerCase();
  const currencyByRegion = {
    uk: "GBP",
    us: "USD",
    eu: "EUR",
    au: "AUD",
    ca: "CAD",
  };
  const targetCurrency = currencyByRegion[targetRegion] || "GBP";

  let scopedAll = all;
  if (targetRegion === "uk") {
    scopedAll = all.filter((row) => row.currencyNorm === "GBP" || row.countryNorm === "UK" || row.countryNorm === "GB");
  } else if (targetRegion === "au") {
    scopedAll = all.filter((row) => row.currencyNorm === "AUD" || row.countryNorm === "AU");
  } else if (targetRegion === "us") {
    scopedAll = all.filter((row) => row.currencyNorm === "USD" || row.countryNorm === "US");
  } else if (targetRegion === "eu") {
    scopedAll = all.filter((row) => row.currencyNorm === "EUR");
  } else if (targetRegion === "ca") {
    scopedAll = all.filter((row) => row.currencyNorm === "CAD" || row.countryNorm === "CA");
  }
  const regionHadRows = scopedAll.length > 0;
  // If region slice is empty (common in beta datasets), fall back to global rows.
  if (!scopedAll.length) scopedAll = all;

  let matches = scopedAll.filter((row) => row.makeNorm === makeNorm && row.modelNorm === modelNorm);
  if (Number.isFinite(year)) {
    matches = matches.filter((row) => !Number.isFinite(row.year) || Math.abs(Number(row.year) - Number(year)) <= 2);
  }
  if (Number.isFinite(mileage)) {
    matches = matches.filter((row) => !Number.isFinite(row.odometerKm) || Math.abs(Number(row.odometerKm) - Number(mileage)) <= 45000);
  }
  if (!matches.length) {
    matches = scopedAll.filter((row) => row.makeNorm === makeNorm && row.modelNorm.includes(modelNorm));
  }
  if (!matches.length) {
    let makeMatches = scopedAll.filter((row) => row.makeNorm === makeNorm);
    if (Number.isFinite(year)) {
      const nearYear = makeMatches.filter((row) => Number.isFinite(row.year) && Math.abs(Number(row.year) - Number(year)) <= 3);
      if (nearYear.length >= 6) {
        makeMatches = nearYear;
      }
    }
    if (Number.isFinite(mileage)) {
      const nearMileage = makeMatches.filter((row) => !Number.isFinite(row.odometerKm) || Math.abs(Number(row.odometerKm) - Number(mileage)) <= 70000);
      if (nearMileage.length >= 6) {
        makeMatches = nearMileage;
      }
    }
    const isOlderVehicle = Number.isFinite(year) && Number(year) <= new Date().getFullYear() - 12;
    if (makeMatches.length >= 8 || (isOlderVehicle && makeMatches.length >= 4)) {
      matches = makeMatches;
    }
  }
  if (!matches.length) {
    const toConvertedSummary = (rows, sourceName, minCount = 6) => {
      if (!Array.isArray(rows) || !rows.length) return null;
      const converted = rows
        .map((row) => ({
          ...row,
          convertedPrice: toTargetCurrency(row.price, row.currency || row.currencyNorm, targetCurrency),
        }))
        .filter((row) => Number.isFinite(row.convertedPrice));
      if (converted.length < minCount) return null;
      const slicedGlobal = converted
        .sort((a, b) => Number(b.convertedPrice) - Number(a.convertedPrice))
        .slice(0, Math.min(CAR_SOLD_COMPS_MAX_RETURN, Math.max(10, Number(limit) || 60)));
      const convertedPrices = slicedGlobal.map((x) => Number(x.convertedPrice)).sort((a, b) => a - b);
      return {
        comps: slicedGlobal,
        summary: {
          count: slicedGlobal.length,
          low: percentileFromSorted(convertedPrices, 0.1),
          median: percentileFromSorted(convertedPrices, 0.5),
          high: percentileFromSorted(convertedPrices, 0.9),
          currency: targetCurrency,
          source: sourceName,
          loadedAt: carSoldCompsLoadedAt,
        },
      };
    };

    let globalMatches = all.filter((row) => row.makeNorm === makeNorm && row.modelNorm.includes(modelNorm));
    if (!globalMatches.length && modelNorm === makeNorm) {
      // Some feeds map "MINI" as model "COOPER/COUNTRYMAN" etc.
      globalMatches = all.filter((row) => row.makeNorm === makeNorm);
    }
    const globalOut = toConvertedSummary(globalMatches, "soldcartracker-global-fallback", 6);
    if (globalOut) return globalOut;

    // Last resort for rare models: make-level comps with tighter year band.
    let makeFallback = all.filter((row) => row.makeNorm === makeNorm);
    if (Number.isFinite(year)) {
      const nearYear = makeFallback.filter((row) => Number.isFinite(row.year) && Math.abs(Number(row.year) - Number(year)) <= 4);
      if (nearYear.length >= 4) makeFallback = nearYear;
    }
    const makeOut = toConvertedSummary(makeFallback, "soldcartracker-make-fallback", 4);
    if (makeOut) return makeOut;
    return { comps: [], summary: null };
  }

  const variantTokens = vehicleVariantTokens(query, makeNorm, modelNorm);
  if (variantTokens.length) {
    const scored = matches.map((row) => {
      const hay = normalizeText(`${row.variant || ""} ${row.rawTitle || ""} ${row.model || ""}`);
      const score = variantTokens.reduce((acc, token) => (hay.includes(token) ? acc + 1 : acc), 0);
      return { row, score };
    });
    let usedCodeMatch = false;
    const codeTokens = variantTokens.filter((t) => /[a-z]{2,}\d{2,}[a-z0-9]*/i.test(t));
    if (codeTokens.length) {
      const codeMatched = scored
        .filter((x) => codeTokens.some((token) => normalizeText(`${x.row.variant || ""} ${x.row.rawTitle || ""}`).includes(token)))
        .map((x) => x.row);
      if (codeMatched.length >= 3) {
        matches = codeMatched;
        usedCodeMatch = true;
      }
    }
    if (!usedCodeMatch) {
      const strong = scored.filter((x) => x.score >= 2).map((x) => x.row);
      const weak = scored.filter((x) => x.score >= 1).map((x) => x.row);
      if (strong.length >= 8) {
        matches = strong;
      } else if (weak.length >= 6) {
        matches = weak;
      }
    }
  }

  matches.sort((a, b) => {
    const ay = Number.isFinite(a.year) ? Math.abs((year || a.year) - a.year) : 99;
    const by = Number.isFinite(b.year) ? Math.abs((year || b.year) - b.year) : 99;
    if (ay !== by) return ay - by;
    return b.price - a.price;
  });

  const sliced = matches.slice(0, Math.min(CAR_SOLD_COMPS_MAX_RETURN, Math.max(10, Number(limit) || 60)));
  // When region-specific sold rows are unavailable, normalize matched global rows into the requested currency.
  const normalizedSliced = regionHadRows
    ? sliced
    : sliced
        .map((row) => {
          const converted = toTargetCurrency(row.price, row.currency || row.currencyNorm, targetCurrency);
          if (!Number.isFinite(converted)) return null;
          return {
            ...row,
            price: Number(converted),
            currency: targetCurrency,
          };
        })
        .filter(Boolean);
  if (!normalizedSliced.length) return { comps: [], summary: null };
  const rawPrices = normalizedSliced.map((x) => Number(x.price)).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  let summaryPrices = filterOutliersIQR(rawPrices);
  if (!summaryPrices.length) summaryPrices = rawPrices;
  if (summaryPrices.length >= 5) {
    const med = percentileFromSorted(summaryPrices, 0.5);
    if (Number.isFinite(med) && med > 0) {
      const lo = med * 0.55;
      const hi = med * 1.9;
      const banded = summaryPrices.filter((n) => n >= lo && n <= hi);
      if (banded.length >= Math.max(3, Math.floor(summaryPrices.length * 0.55))) {
        summaryPrices = banded.sort((a, b) => a - b);
      }
    }
  }
  const prices = summaryPrices.length ? summaryPrices : rawPrices;
  const exactModelCount = normalizedSliced.filter((row) => row.modelNorm === modelNorm).length;
  const nearModelCount = normalizedSliced.filter((row) => row.modelNorm.includes(modelNorm) || modelNorm.includes(row.modelNorm)).length;
  const nearYearCount = Number.isFinite(year)
    ? normalizedSliced.filter((row) => Number.isFinite(row.year) && Math.abs(Number(row.year) - Number(year)) <= 2).length
    : null;
  const spreadPct = prices.length >= 3
    ? Math.max(0, (percentileFromSorted(prices, 0.9) - percentileFromSorted(prices, 0.1)) / Math.max(1, percentileFromSorted(prices, 0.5)))
    : null;
  const summary = {
    count: prices.length,
    low: percentileFromSorted(prices, 0.1),
    median: percentileFromSorted(prices, 0.5),
    high: percentileFromSorted(prices, 0.9),
    currency: regionHadRows ? (normalizedSliced[0]?.currency || targetCurrency) : targetCurrency,
    source: regionHadRows ? "soldcartracker" : "soldcartracker-global-fallback",
    exactModelCount,
    nearModelCount,
    nearYearCount,
    spreadPct,
    regionScoped: regionHadRows,
    loadedAt: carSoldCompsLoadedAt,
  };
  return { comps: normalizedSliced, summary };
}

async function lookupUkVehicleWebBenchmark({ make, model, year = null, market = MARKET_CONFIG.uk }) {
  const makeNorm = normalizeCarText(make);
  const modelNorm = normalizeCarText(model);
  const makeMatchNorm = normalizeText(make || makeNorm).replace(/[.-]+/g, " ").replace(/\s+/g, " ").trim();
  const modelMatchNorm = normalizeText(model || modelNorm).replace(/[.-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!makeNorm || !modelNorm) return { comps: [], summary: null };

  const yearToken = Number.isFinite(Number(year)) ? String(Number(year)) : "";
  const makeTextRaw = String(make || makeNorm).trim() || makeNorm;
  const modelTextRaw = String(model || modelNorm).trim() || modelNorm;
  const makeTextAlt = makeTextRaw.replace(/\bmercedes benz\b/i, "mercedes-benz");
  const modelTextAlt = modelTextRaw.replace(/\b([a-z])\s+class\b/i, "$1-class");
  const coreVariants = unique([
    [yearToken, makeTextRaw, modelTextRaw].filter(Boolean).join(" ").trim(),
    [yearToken, makeTextAlt, modelTextAlt].filter(Boolean).join(" ").trim(),
    [yearToken, makeTextRaw, modelTextAlt].filter(Boolean).join(" ").trim(),
  ]).filter(Boolean).slice(0, 3);

  const queries = unique(
    coreVariants.flatMap((coreQuery) => [
      `${coreQuery} used price uk`,
      `${coreQuery} price guide uk`,
      `${coreQuery} for sale uk`,
      `${coreQuery} for sale uk site:cargurus.co.uk`,
      `${coreQuery} used cars for sale site:autotrader.co.uk`,
      `${coreQuery} private sale value uk`,
    ])
  ).filter(Boolean).slice(0, 8);

  const collected = [];
  for (const q of queries) {
    // eslint-disable-next-line no-await-in-loop
    const web = await serpApiWebSearch(q, market || MARKET_CONFIG.uk, Math.min(3200, SERPAPI_TIMEOUT_MS));
    if (!web.ok) continue;
    for (const row of web.results || []) {
      if (!row) continue;
      const title = String(row.title || "").trim();
      const snippet = String(row.snippet || "").trim();
      const link = String(row.link || "").trim();
      const text = `${title} ${snippet}`.trim();
      if (!text) continue;
      const hay = normalizeText(text).replace(/[.-]+/g, " ").replace(/\s+/g, " ").trim();
      if (!hay.includes(makeMatchNorm) || !hay.includes(modelMatchNorm)) continue;
      const gbpMatches = [];
      const directCurrencyPattern = /£\s?(\d{1,3}(?:,\d{3})+|\d{3,6})(?:\.\d{2})?/gi;
      for (const match of text.matchAll(directCurrencyPattern)) {
        const n = parsePriceToNumber(match[0]);
        if (Number.isFinite(n)) gbpMatches.push(Number(n));
      }
      const gbpWordPattern = /\bgbp\s?(\d{1,3}(?:,\d{3})+|\d{3,6})(?:\.\d{2})?\b/gi;
      for (const match of text.matchAll(gbpWordPattern)) {
        const n = parsePriceToNumber(match[0]);
        if (Number.isFinite(n)) gbpMatches.push(Number(n));
      }
      const usableMatches = unique(gbpMatches)
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n) && n >= 500 && n <= 200000)
        .slice(0, 3);
      if (!usableMatches.length) continue;
      for (const n of usableMatches) {
        collected.push({
          title: title || `${make} ${model}`.trim(),
          snippet,
          link,
          source: row.displayed_link || "autotrader.co.uk",
          n: Number(n),
        });
      }
      if (collected.length >= 24) break;
    }
    if (collected.length >= 24) break;
  }

  if (!collected.length) return { comps: [], summary: null };

  const deduped = [];
  const seen = new Set();
  for (const row of collected) {
    const key = `${Math.round(Number(row.n) || 0)}|${normalizeText(row.title).slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }
  if (!deduped.length) return { comps: [], summary: null };

  const prices = deduped
    .map((row) => Number(row.n))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  if (prices.length < 3) {
    return {
      comps: deduped.slice(0, 6).map((row) => ({
        title: row.title,
        price: `GBP ${row.n}`,
        source: row.source,
        link: row.link,
      })),
      summary: null,
    };
  }

  let filteredPrices = filterOutliersIQR(prices);
  const filteredMedian = median(filteredPrices);
  if (Number.isFinite(filteredMedian) && filteredMedian > 0) {
    const lo = filteredMedian * 0.55;
    const hi = filteredMedian * 1.9;
    const banded = filteredPrices.filter((n) => n >= lo && n <= hi);
    if (banded.length >= 3) filteredPrices = banded;
  }
  filteredPrices = filteredPrices.sort((a, b) => a - b);
  if (filteredPrices.length < 3) {
    return {
      comps: deduped.slice(0, 6).map((row) => ({
        title: row.title,
        price: `GBP ${row.n}`,
        source: row.source,
        link: row.link,
      })),
      summary: null,
    };
  }

  const summary = {
    count: filteredPrices.length,
    low: percentileFromSorted(filteredPrices, 0.15),
    median: percentileFromSorted(filteredPrices, 0.5),
    high: percentileFromSorted(filteredPrices, 0.85),
    currency: "GBP",
    source: "uk-web-benchmark",
  };

  return {
    comps: deduped.slice(0, 10).map((row) => ({
      title: row.title,
      price: `GBP ${row.n}`,
      source: row.source,
      link: row.link,
    })),
    summary,
  };
}

function parseCheckCarValuationSummary(payload) {
  if (!payload || typeof payload !== "object") return null;
  const valuationList = payload.ValuationList || payload.valuationList || payload.valuation || payload.Valuation || {};
  if (!valuationList || typeof valuationList !== "object") return null;
  const values = [];
  for (const value of Object.values(valuationList)) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) values.push(n);
  }
  if (!values.length) return null;
  values.sort((a, b) => a - b);
  return {
    count: values.length,
    low: percentileFromSorted(values, 0.15),
    median: percentileFromSorted(values, 0.5),
    high: percentileFromSorted(values, 0.85),
    currency: "GBP",
    source: "checkcardetails-valuation",
    valuationList,
  };
}

async function fetchUkVehicleValuationFromCheckCar({
  registrationNumber,
  mileage = null,
  allowStaleCache = true,
  timeoutMs = 7000,
}) {
  const reg = normalizeUkReg(registrationNumber);
  if (!reg) return { ok: false, error: "missing registration number" };

  const freshCache = getCachedUkValuationSummary(reg, { allowStale: false });
  if (freshCache?.summary) {
    return {
      ok: true,
      summary: freshCache.summary,
      fromCache: true,
      stale: false,
      cacheAgeSec: Math.round(Number(freshCache.ageMs || 0) / 1000),
      cacheSavedAt: freshCache.savedAt || null,
    };
  }

  if (!CHECKCAR_API_KEY || !CHECKCAR_VALUATION_URL_TEMPLATE) {
    const staleSetupCache = allowStaleCache ? getCachedUkValuationSummary(reg, { allowStale: true }) : null;
    if (staleSetupCache?.summary) {
      return {
        ok: true,
        summary: staleSetupCache.summary,
        fromCache: true,
        stale: true,
        cacheAgeSec: Math.round(Number(staleSetupCache.ageMs || 0) / 1000),
        cacheSavedAt: staleSetupCache.savedAt || null,
      };
    }
    return { ok: false, error: "missing valuation setup" };
  }
  const valuationBudget = checkcarBudgetDecision({ costTier: "primary" });
  if (!valuationBudget.allow) {
    const staleBudgetCache = allowStaleCache ? getCachedUkValuationSummary(reg, { allowStale: true }) : null;
    if (staleBudgetCache?.summary) {
      return {
        ok: true,
        summary: staleBudgetCache.summary,
        fromCache: true,
        stale: true,
        cacheAgeSec: Math.round(Number(staleBudgetCache.ageMs || 0) / 1000),
        cacheSavedAt: staleBudgetCache.savedAt || null,
        warning: valuationBudget.message,
      };
    }
    return {
      ok: false,
      code: valuationBudget.code || "checkcar_budget_limited",
      error: valuationBudget.message || "Valuation blocked by daily provider budget limits.",
      usage: valuationBudget.usage,
    };
  }
  const url = CHECKCAR_VALUATION_URL_TEMPLATE
    .replaceAll("{vrm}", encodeURIComponent(reg))
    .replaceAll("{key}", encodeURIComponent(CHECKCAR_API_KEY))
    .replaceAll("{mileage}", encodeURIComponent(Number.isFinite(Number(mileage)) ? String(Number(mileage)) : ""));
  const controller = new AbortController();
  const safeTimeoutMs = Math.max(1500, Number(timeoutMs) || 7000);
  const timeoutId = setTimeout(() => controller.abort(), safeTimeoutMs);
  try {
    incrementCheckcarUsage("valuation", 1);
    const resp = await fetch(url, { method: "GET", signal: controller.signal });
    const text = await resp.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    if (!resp.ok) {
      const staleHttpCache = allowStaleCache ? getCachedUkValuationSummary(reg, { allowStale: true }) : null;
      if (staleHttpCache?.summary) {
        return {
          ok: true,
          summary: staleHttpCache.summary,
          fromCache: true,
          stale: true,
          cacheAgeSec: Math.round(Number(staleHttpCache.ageMs || 0) / 1000),
          cacheSavedAt: staleHttpCache.savedAt || null,
          warning: `valuation endpoint http ${resp.status}`,
        };
      }
      return { ok: false, error: `valuation endpoint http ${resp.status}` };
    }
    const payload = json?.data || json?.result || json || {};
    const summary = parseCheckCarValuationSummary(payload);
    if (!summary) {
      const stalePayloadCache = allowStaleCache ? getCachedUkValuationSummary(reg, { allowStale: true }) : null;
      if (stalePayloadCache?.summary) {
        return {
          ok: true,
          summary: stalePayloadCache.summary,
          fromCache: true,
          stale: true,
          cacheAgeSec: Math.round(Number(stalePayloadCache.ageMs || 0) / 1000),
          cacheSavedAt: stalePayloadCache.savedAt || null,
          warning: "valuation payload missing usable prices",
        };
      }
      return { ok: false, error: "valuation payload missing usable prices" };
    }
    const normalizedSummary = {
      ...summary,
      source: summary?.source || "checkcardetails-valuation",
    };
    setCachedUkValuationSummary(reg, normalizedSummary);
    return { ok: true, summary: normalizedSummary, raw: payload, fromCache: false, stale: false };
  } catch (err) {
    const staleErrorCache = allowStaleCache ? getCachedUkValuationSummary(reg, { allowStale: true }) : null;
    if (staleErrorCache?.summary) {
      return {
        ok: true,
        summary: staleErrorCache.summary,
        fromCache: true,
        stale: true,
        cacheAgeSec: Math.round(Number(staleErrorCache.ageMs || 0) / 1000),
        cacheSavedAt: staleErrorCache.savedAt || null,
        warning: err?.name === "AbortError" ? "valuation endpoint timeout" : String(err?.message || err),
      };
    }
    if (err?.name === "AbortError") return { ok: false, error: "valuation endpoint timeout" };
    return { ok: false, error: String(err?.message || err) };
  } finally {
    clearTimeout(timeoutId);
  }
}

function pricingFromVehicleValuation({
  valuation,
  query,
  category,
  region,
  market,
  conditionTier,
  condition,
  vehicleYear,
  stage,
  fingerprint,
  ukVehicleStatus,
  ukVehicleStatusError,
  vehicleRegDetected,
}) {
  if (!valuation || !Number.isFinite(Number(valuation.median))) return null;
  if (String(region || "").toLowerCase() === "uk") {
    const makeForBaseline = ukVehicleStatus?.make || "";
    const modelForBaseline = ukVehicleStatus?.model || "";
    const yearForBaseline = vehicleYear || ukVehicleStatus?.yearOfManufacture || null;
    if (makeForBaseline && modelForBaseline) {
      updateUkModelBaselineSummary({
        make: makeForBaseline,
        model: modelForBaseline,
        year: yearForBaseline,
        valuation,
      });
    }
  }
  const valuationCount = Number(valuation.count || 0);
  const valuationSource = String(valuation.source || "").toLowerCase();
  const regIdentityConfirmed = looksLikeUkRegistration(vehicleRegDetected || "");
  const supportsLowerCount =
    valuationSource.includes("uk-model-baseline") ||
    valuationSource.includes("sold-baseline") ||
    valuationSource.includes("soldcartracker-global-fallback");
  const minCount = supportsLowerCount ? 3 : 4;
  const valuationReady = valuationCount >= minCount && (Boolean(ukVehicleStatus?.ok) || regIdentityConfirmed);
  const provisional = buildProvisionalPricing({
    query,
    category,
    region,
    market,
    conditionTier,
    condition,
    vehicleYear,
    confidenceScore: 72,
    reason: "Using provider valuation fallback while market comps are sparse.",
  });
  const cleanBand = sanitizePriceBand({
    low: Number(valuation.low),
    median: Number(valuation.median),
    high: Number(valuation.high),
    category,
  });
  provisional.low = cleanBand.low;
  provisional.median = cleanBand.median;
  provisional.high = cleanBand.high;
  provisional.currency = valuation.currency || provisional.currency;
  provisional.finalStatus = valuationReady ? "usable" : "needs_details";
  provisional.confidence = { score: valuationReady ? 74 : 58, label: valuationReady ? "high" : "medium" };
  const sourceReason = valuationSource.includes("uk-model-baseline")
    ? "learned model baseline from validated UK valuations"
    : valuationSource.includes("sold")
      ? "sold benchmark-derived valuation band"
      : "provider valuation feed";
  provisional.confidenceReasons = [sourceReason, "vehicle identity matched via registration"];
  provisional.qualityGate = {
    status: "pass",
    score: 74,
    metrics: { compCount: Number(valuation.count || 0), sourceCount: 1, avgMatchScore: 84, spreadPct: 0.22 },
    reasons: ["valuation provider returned structured retail bands"],
  };
  provisional.stage = stage;
  provisional.refineRecommended = false;
  provisional.fingerprint = fingerprint;
  provisional.vehicleStatus = ukVehicleStatus;
  provisional.vehicleStatusError = ukVehicleStatusError;
  provisional.vehicleRegDetected = vehicleRegDetected;
  provisional.soldCompsBenchmark = {
    source: String(valuation.source || "checkcardetails-valuation"),
    count: Number(valuation.count || 0),
    low: Number(cleanBand.low || 0),
    median: Number(cleanBand.median || 0),
    high: Number(cleanBand.high || 0),
    currency: valuation.currency || "GBP",
  };
  provisional.vehicleValuation = valuation;
  provisional.accuracy = {
    ready: valuationReady,
    score: valuationReady ? 80 : 62,
    blockers: valuationReady ? [] : ["provider valuation available but sold evidence is limited"],
  };
  return provisional;
}

function valuationSummaryFromVehicleStatus(status) {
  const v = status?.valuation;
  if (!v || typeof v !== "object") return null;
  const low = Number(v.low || 0);
  const median = Number(v.median || 0);
  const high = Number(v.high || 0);
  if (!Number.isFinite(median) || median <= 0) return null;
  return {
    count: Number(v.count || 0) || 0,
    low: Number.isFinite(low) && low > 0 ? low : median * 0.85,
    median,
    high: Number.isFinite(high) && high > 0 ? high : median * 1.15,
    currency: String(v.currency || "GBP").toUpperCase(),
    source: String(v.source || "vehicle-status-valuation"),
  };
}

function applyVehicleBenchmarkReadiness(provisional, benchmark, vehicleStatus) {
  const next = { ...(provisional || {}) };
  const count = Number(benchmark?.count || 0);
  const source = String(benchmark?.source || "").toLowerCase();
  const makeNorm = normalizeCarText(benchmark?.make || "");
  const modelNorm = normalizeCarText(benchmark?.model || "");
  const genericModel = !modelNorm || !makeNorm || modelNorm === makeNorm || modelNorm.length <= 4;
  const exactModelCount = Number(benchmark?.exactModelCount || 0);
  const nearModelCount = Number(benchmark?.nearModelCount || 0);
  const nearYearCount = Number(benchmark?.nearYearCount || 0);
  const median = Number(benchmark?.median || 0);
  const low = Number(benchmark?.low || 0);
  const high = Number(benchmark?.high || 0);
  const spreadPctFromBand =
    Number.isFinite(median) && median > 0 && Number.isFinite(low) && Number.isFinite(high)
      ? Math.max(0, (high - low) / median)
      : 999;
  const spreadPct = Number.isFinite(Number(benchmark?.spreadPct))
    ? Number(benchmark?.spreadPct)
    : spreadPctFromBand;
  const statusOk = Boolean(vehicleStatus?.ok);
  const globalModelStrong =
    source === "soldcartracker-global-fallback" &&
    exactModelCount >= 3 &&
    nearModelCount >= 3 &&
    (
      (count >= 3 && spreadPct <= 0.45) ||
      (count >= 6 && spreadPct <= 0.65) ||
      (count >= 10 && spreadPct <= 0.85)
    ) &&
    (nearYearCount <= 0 || nearYearCount >= 2);
  const globalGenericModelStrong =
    source === "soldcartracker-global-fallback" &&
    genericModel &&
    count >= 14 &&
    spreadPct <= 0.9 &&
    (nearYearCount <= 0 || nearYearCount >= 5);
  const strictModelStrong =
    source === "soldcartracker" &&
    exactModelCount >= 3 &&
    (
      (count >= 3 && spreadPct <= 0.5) ||
      (count >= 5 && spreadPct <= 0.75)
    );
  const hasStrongBenchmark =
    strictModelStrong ||
    globalModelStrong ||
    globalGenericModelStrong ||
    (source === "uk-web-benchmark" && ((count >= 4 && spreadPct <= 1.1) || (count >= 3 && spreadPct <= 0.35))) ||
    (source === "soldcartracker-make-fallback" && count >= 12 && spreadPct <= 0.8);
  const ready = statusOk && hasStrongBenchmark;
  next.finalStatus = ready ? "usable" : "needs_details";
  const readyScore = source === "soldcartracker" ? 76 : source === "uk-web-benchmark" ? 72 : source === "soldcartracker-global-fallback" ? 70 : 68;
  next.accuracy = {
    ready,
    score: ready ? readyScore : Math.max(45, Number(next?.confidence?.score || 55)),
    blockers: ready ? [] : ["vehicle sold benchmark not yet strong enough for final pricing"],
  };
  if (ready && source === "soldcartracker-global-fallback") {
    const minScore = globalGenericModelStrong ? 60 : 62;
    next.confidence = { score: Math.max(minScore, Number(next?.confidence?.score || 0)), label: "medium" };
    next.confidenceReasons = unique([
      ...(next.confidenceReasons || []),
      globalGenericModelStrong
        ? "global sold comps support this vehicle class where model naming is broad"
        : "global sold comps strongly match make/model despite limited UK-only coverage",
    ]);
  }
  if (!ready && (source === "soldcartracker-global-fallback" || source === "soldcartracker-make-fallback")) {
    return withholdProvisionalNumbers(
      next,
      "cross-market sold fallback is too weak for reliable UK vehicle pricing"
    );
  }
  if (!ready && source === "uk-web-benchmark") {
    return withholdProvisionalNumbers(
      next,
      "uk vehicle web benchmark is still too sparse for final pricing"
    );
  }
  return next;
}

function parseMakeModelFromVehicleQuery(query, fallbackMake, fallbackModel) {
  const clean = normalizeCarText(query);
  let make = normalizeCarText(fallbackMake);
  let model = normalizeCarText(fallbackModel);
  if (make && model) return { make, model };
  if (!clean) return { make, model };

  const normQuery = normalizeText(query);
  if (!make) {
    const orderedMakes = [...VEHICLE_MAKES].sort((a, b) => b.length - a.length);
    for (const knownMake of orderedMakes) {
      const normMake = normalizeText(knownMake);
      if (normMake && normQuery.includes(normMake)) {
        make = normalizeCarText(knownMake);
        break;
      }
    }
  }

  const tokens = clean.split(" ").filter(Boolean);
  const makeTokenSet = new Set((make || "").split(" ").filter(Boolean));
  const modelCandidates = tokens.filter((t) => {
    if (!t) return false;
    if (/^\d{4}$/.test(t)) return false;
    if (/^\d+$/.test(t)) return false;
    if (makeTokenSet.has(t)) return false;
    if (isVehicleNoiseToken(t)) return false;
    if (["manual", "automatic", "diesel", "petrol", "turbo", "wagon", "hatchback", "sedan", "suv", "cab", "chassis", "speed", "awd", "4x4", "2wd"].includes(t)) return false;
    return t.length >= 2;
  });

  if (!make && tokens[0]) make = tokens[0];
  if (!model && modelCandidates[0]) model = modelCandidates[0];
  if (!model && tokens[1] && !/^\d{4}$/.test(tokens[1])) model = tokens[1];
  return { make, model };
}

function isVehicleNoiseToken(token) {
  const t = String(token || "").toLowerCase().trim();
  if (!t) return true;
  if (STOP_WORDS.has(t)) return true;
  return new Set([
    "vrm",
    "vin",
    "reg",
    "registration",
    "number",
    "plate",
    "mot",
    "tax",
    "status",
    "check",
    "checker",
    "history",
    "vehicle",
    "car",
    "uk",
  ]).has(t);
}

function buildVehicleValuationQuery({ query, registration, make, model, year }) {
  const regNorm = normalizeUkReg(registration || "");
  const tokens = normalizeText(query)
    .split(" ")
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !isVehicleNoiseToken(t))
    .filter((t) => normalizeUkReg(t) !== regNorm)
    .filter((t) => !looksLikeUkRegistration(t))
    .filter((t) => t.length > 1);

  const makeTokens = normalizeText(make || "").split(" ").filter(Boolean);
  const modelTokens = normalizeText(model || "").split(" ").filter(Boolean);
  const yearToken = Number.isFinite(Number(year)) ? [String(Number(year))] : [];
  const merged = unique([...makeTokens, ...modelTokens, ...yearToken, ...tokens]).filter(Boolean);

  if (!merged.length) {
    const fallback = [make, model, year].filter(Boolean).join(" ").trim();
    return fallback || String(query || "").trim();
  }
  const result = merged.join(" ").trim();
  if (!result) return String(query || "").trim();
  return result;
}

// --- helpers ---
function parsePriceToNumber(priceStr) {
  // examples: "£12.99", "$1,299.00"
  if (!priceStr || typeof priceStr !== "string") return null;
  const cleaned = priceStr.replace(/[^0-9.,]/g, "").replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parsePriceFromText(text) {
  const s = String(text || "");
  const directCurrencyMatch = s.match(
    /(?:[£$€]\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\b(?:gbp|usd|eur|aud|cad)\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/i
  );
  if (directCurrencyMatch) return parsePriceToNumber(directCurrencyMatch[0]);

  // Fallback: only accept naked numbers when strongly framed as price text.
  const contextualMatch = s.match(/\b(?:price|from|now|only|asking|offer)\b[^0-9]{0,8}(\d{2,6}(?:\.\d{2})?)/i);
  if (!contextualMatch) return null;
  return parsePriceToNumber(contextualMatch[1]);
}

function hasExplicitPriceHint(text) {
  return /[£$€]|gbp|usd|eur|aud|cad|price|from|now|only/i.test(String(text || ""));
}

function extractYear(text) {
  const m = String(text || "").match(/\b(19[8-9]\d|20[0-3]\d)\b/);
  return m ? Number(m[1]) : null;
}

function isLikelyYearPrice(value, title, priceStr) {
  if (!Number.isFinite(value)) return false;
  const year = extractYear(title);
  if (!Number.isFinite(year)) return false;
  const hasCurrency = /[£$€]|usd|gbp|eur|aud|cad/i.test(String(priceStr || ""));
  if (hasCurrency) return false;
  const currentYear = new Date().getFullYear();
  if (value < 1900 || value > currentYear + 1) return false;
  return Math.abs(Number(value) - year) <= 1;
}

function estimateVehicleAdjustment({ year, mileage, conditionNotes, condition }) {
  let factor = 1;
  const reasons = [];
  const currentYear = new Date().getFullYear();

  if (Number.isFinite(year)) {
    const age = Math.max(0, currentYear - year);
    if (age >= 15) {
      factor *= 0.8;
      reasons.push("older vehicle age adjustment");
    } else if (age >= 10) {
      factor *= 0.88;
      reasons.push("mid-age vehicle adjustment");
    }
  }

  if (Number.isFinite(mileage) && Number.isFinite(year)) {
    const age = Math.max(1, currentYear - year);
    const expected = age * 12000;
    const ratio = mileage / expected;
    if (ratio > 1.4) {
      factor *= 0.82;
      reasons.push("high mileage adjustment");
    } else if (ratio > 1.2) {
      factor *= 0.9;
      reasons.push("above-average mileage adjustment");
    } else if (ratio < 0.7) {
      factor *= 1.08;
      reasons.push("low mileage adjustment");
    }
  }

  const notes = normalizeText(conditionNotes);
  if (condition === "used") {
    factor *= 0.96;
  }
  if (/(broken|not running|won't start|wont start|engine fault|salvage|damaged|accident|cat s|cat n)/.test(notes)) {
    factor *= 0.7;
    reasons.push("major condition issue adjustment");
  } else if (/(scratch|dent|crack|warning light|service due)/.test(notes)) {
    factor *= 0.88;
    reasons.push("minor condition issue adjustment");
  }

  factor = Math.max(0.45, Math.min(1.2, factor));
  return { factor, reasons };
}

function hasCloseVehicleYear(title, targetYear) {
  if (!Number.isFinite(targetYear)) return true;
  const y = extractYear(title);
  if (!Number.isFinite(y)) return true;
  return Math.abs(y - targetYear) <= 2;
}

function extractVehicleDescriptor(text) {
  const t = normalizeText(text);
  const year = extractYear(t);
  const make = VEHICLE_MAKES.find((m) => t.includes(m));
  const model = VEHICLE_MODELS.find((m) => t.includes(m));
  if (make && model) return `${make} ${model}${year ? ` ${year}` : ""}`;
  if (make) return `${make}${year ? ` ${year}` : ""} car`;
  return null;
}

function extractLuxuryBrandDescriptor(text) {
  const t = normalizeText(text);
  const brands = [
    "rolex", "omega", "cartier", "patek philippe", "audemars piguet", "tag heuer",
    "breitling", "tudor", "hublot", "iwc", "panerai", "vacheron constantin",
    "tiffany", "louis vuitton", "gucci", "chanel", "hermes",
  ];
  const hit = brands.find((b) => t.includes(b));
  if (!hit) return null;

  if (/\b(watch|wristwatch|datejust|submariner|daytona|gmt|oyster)\b/.test(t)) {
    return `${hit} watch`;
  }
  if (/\b(necklace|bracelet|ring|earrings|pendant)\b/.test(t)) {
    return `${hit} jewelry`;
  }
  return hit;
}

function extractStorageCapacityGb(text) {
  const t = normalizeText(text);
  const match = t.match(/\b(1|2|32|64|128|256|512|1024)\s?(tb|gb|g)\b/);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = String(match[2] || "").toLowerCase();
  if (unit === "tb") return amount * 1024;
  return amount;
}

function extractPhoneAttributes(text) {
  const t = normalizeText(text);
  const modelPatterns = [
    /\b(iphone\s?\d{1,2}(?:\s?plus|\s?mini|\s?pro(?:\s?max)?)?)\b/,
    /\b(ipad(?:\s?(?:air|mini|pro))?(?:\s?\d{1,2}(?:st|nd|rd|th)?\s?gen)?)\b/,
    /\b(macbook(?:\s?(?:air|pro))?(?:\s?(?:m1|m2|m3|m4))?)\b/,
    /\b(galaxy\s?s\d{1,2}(?:\s?ultra|\s?plus)?)\b/,
    /\b(pixel\s?\d{1,2}(?:\s?pro|\s?a)?)\b/,
    /\b(surface\s?(?:pro|laptop)\s?\d{0,2})\b/,
  ];
  let model = null;
  for (const pattern of modelPatterns) {
    const hit = t.match(pattern);
    if (hit && hit[1]) {
      model = hit[1];
      break;
    }
  }

  return {
    model,
    storageGb: extractStorageCapacityGb(t),
  };
}

function extractFashionAttributes(text) {
  const t = normalizeText(text);
  const brandMatch = t.match(
    /\b(nike|adidas|puma|reebok|new balance|north face|the north face|levi(?:s|'s)?|carhartt|patagonia|moncler|canada goose)\b/
  );
  let itemType = null;
  if (/\b(jeans|denim)\b/.test(t)) itemType = "jeans";
  else if (/\b(trainer|trainers|sneaker|sneakers|shoe|shoes)\b/.test(t)) itemType = "trainers";
  else if (/\b(jacket|coat|parka|puffer)\b/.test(t)) itemType = "jacket";
  else if (/\b(hoodie|sweatshirt)\b/.test(t)) itemType = "hoodie";
  else if (/\b(tshirt|t-shirt|tee|shirt)\b/.test(t)) itemType = "shirt";

  const modelTokens = [];
  const airMax = t.match(/\b(air max \d{2,3})\b/);
  const jordan = t.match(/\b(jordan \d{1,2})\b/);
  if (airMax?.[1]) modelTokens.push(airMax[1]);
  if (jordan?.[1]) modelTokens.push(jordan[1]);

  return {
    brand: brandMatch ? brandMatch[1].replace(/\bthe\s+/, "").trim() : null,
    itemType,
    modelTokens,
  };
}

function extractJewelryAttributes(text) {
  const t = normalizeText(text);
  const metalMatch = t.match(/\b(gold|silver|platinum|stainless|rose gold|white gold)\b/);
  const caratMatch = t.match(/\b(9k|10k|14k|18k|22k|24k)\b/);
  const brandMatch = t.match(/\b(tiffany|cartier|pandora|bulgari|chanel)\b/);
  return {
    metal: metalMatch ? metalMatch[1] : null,
    carat: caratMatch ? caratMatch[1] : null,
    brand: brandMatch ? brandMatch[1] : null,
  };
}

function compMatchesJewelryQuery(title, query) {
  const q = extractJewelryAttributes(query);
  if (!q.metal && !q.carat && !q.brand) return true;
  const t = normalizeText(title);
  if (q.brand && !t.includes(q.brand)) return false;
  if (q.carat && !t.includes(q.carat)) return false;
  if (q.metal && !t.includes(q.metal)) return false;
  return true;
}

function compMatchesFashionQuery(title, query) {
  const q = extractFashionAttributes(query);
  if (!q.brand && !q.itemType && !q.modelTokens.length) return true;
  const t = normalizeText(title);
  const rawTitle = String(title || "");
  if (q.brand && !t.includes(q.brand)) return false;

  if (q.itemType === "jeans" && !/\b(jeans|denim)\b/.test(t)) return false;
  if (q.itemType === "trainers" && !/\b(trainer|trainers|sneaker|sneakers|shoe|shoes)\b/.test(t)) return false;
  if (q.itemType === "jacket" && !/\b(jacket|coat|parka|puffer)\b/.test(t)) return false;
  if (q.itemType === "hoodie" && !/\b(hoodie|sweatshirt)\b/.test(t)) return false;
  if (q.itemType === "shirt" && !/\b(tshirt|t-shirt|tee|shirt)\b/.test(t)) return false;

  if (q.modelTokens.length) {
    const hasModel = q.modelTokens.some((token) => t.includes(token));
    if (!hasModel) return false;
  }

  // Filter obvious fashion accessories when user asked for clothing or shoes.
  if (q.itemType && /\b(lace|insole|box only|tag only)\b/i.test(rawTitle)) return false;
  return true;
}

function extractWatchAttributes(text) {
  const t = normalizeText(text);
  const brandMatch = t.match(/\b(rolex|omega|cartier|tag heuer|breitling|tudor|hublot|iwc|panerai)\b/);
  const modelTokens = [
    "datejust", "submariner", "daytona", "gmt", "gmt master", "oyster", "oyster perpetual",
    "sea dweller", "yacht master", "air king", "speedmaster", "seamaster", "tank",
  ].filter((m) => t.includes(m));
  return {
    brand: brandMatch ? brandMatch[1] : null,
    modelTokens: modelTokens.slice(0, 3),
  };
}

function compMatchesWatchQuery(title, query) {
  const q = extractWatchAttributes(query);
  if (!q.brand && !q.modelTokens.length) return true;
  const t = normalizeText(title);
  if (q.brand && !t.includes(q.brand)) return false;
  if (q.modelTokens.length) {
    const hasAnyModel = q.modelTokens.some((m) => t.includes(m));
    if (!hasAnyModel) return false;
  }
  return true;
}

function extractToolAttributes(text) {
  const t = normalizeText(text);
  const brandMatch = t.match(/\b(makita|dewalt|milwaukee|bosch|ryobi|festool)\b/);
  const voltageMatch = t.match(/\b(12v|18v|20v|40v|60v)\b/);
  const modelMatch = t.match(/\b([a-z]{1,4}\d{2,5}[a-z]?)\b/);
  return {
    brand: brandMatch ? brandMatch[1] : null,
    voltage: voltageMatch ? voltageMatch[1] : null,
    modelToken: modelMatch ? modelMatch[1] : null,
  };
}

function compMatchesToolQuery(title, query) {
  const q = extractToolAttributes(query);
  if (!q.brand && !q.voltage && !q.modelToken) return true;
  const t = normalizeText(title);
  if (q.brand && !t.includes(q.brand)) return false;
  if (q.voltage && !t.includes(q.voltage)) return false;
  if (q.modelToken && !t.includes(q.modelToken)) return false;
  return true;
}

function sourceReliabilityWeight(source, category) {
  const s = normalizeText(source);
  if (!s) return 1;
  if (s.includes("ebay")) return 1.1;
  if (s.includes("autotrader") || s.includes("cars.com")) return category === "vehicle" ? 1.16 : 1.02;
  if (s.includes("swappa")) return category === "electronics" ? 1.14 : 1.03;
  if (s.includes("stockx") || s.includes("goat") || s.includes("therealreal")) return category === "fashion" ? 1.12 : 1.02;
  if (s.includes("facebook") || s.includes("craigslist")) return 0.95;
  return 1;
}

function listingQualityPenalty({ title, query, category, condition }) {
  const t = normalizeText(title);
  const q = normalizeText(query);
  let penalty = 0;

  if (/\b(for parts|parts only|spares|repair|broken|damaged|not working|faulty)\b/.test(t)) penalty += 0.45;
  if (/\b(nb screen|screen issue|screen fault|cracked screen|lcd issue|display issue)\b/.test(t)) penalty += 0.45;
  if (/\b(box only|empty box|manual only|case only|strap only|charger only)\b/.test(t)) penalty += 0.4;
  if (/\b(replica|copy|inspired|lookalike|style)\b/.test(t)) penalty += 0.55;
  if (condition === "used" && /\b(new sealed|brand new|factory sealed)\b/.test(t)) penalty += 0.1;

  const wantsWatch = /\b(rolex|omega|tag heuer|breitling|cartier)\b/.test(q);
  if (wantsWatch && /\b(homage|mod|aftermarket|custom dial|replacement dial)\b/.test(t)) penalty += 0.55;

  const wantsVehicle = category === "vehicle";
  if (wantsVehicle && /\b(tyre|tire|wheel|rim|headlight|bumper|door|fender|engine|gearbox|transmission)\b/.test(t)) {
    if (!/\b(tyre|tire|wheel|rim|headlight|bumper|door|fender|engine|gearbox|transmission)\b/.test(q)) {
      penalty += 0.5;
    }
  }

  return Math.max(0, Math.min(0.95, penalty));
}

function vehicleMakeModelFromQuery(q) {
  const t = normalizeText(q);
  const make = VEHICLE_MAKES.find((m) => t.includes(m)) || null;
  const model = VEHICLE_MODELS.find((m) => t.includes(m)) || null;
  return { make, model };
}

function compMatchesVehicleQuery(title, query) {
  const { make, model } = vehicleMakeModelFromQuery(query);
  const t = normalizeText(title);
  if (make && !t.includes(make)) return false;
  if (model && !t.includes(model)) return false;
  return true;
}

function vehicleVariantMatchScore(query, title) {
  const q = normalizeText(query);
  const t = normalizeText(title);
  if (!q || !t) return { codeHits: 0, trimHits: 0 };
  const variantTokens = vehicleVariantTokens(q, "", "");
  const codeTokens = variantTokens.filter((token) => /[a-z]{1,}\d{2,}[a-z0-9]*/i.test(token));
  const trimTokens = variantTokens.filter((token) =>
    ["sr", "sx", "xlt", "sport", "premium", "elite", "gt", "tsi", "tdi", "tfsi", "v6", "v8", "4x4", "awd", "2wd", "dual", "cab", "chassis", "wagon", "sedan", "hatchback", "manual", "automatic", "diesel", "petrol", "hybrid", "turbo"].includes(token)
  );
  const codeHits = codeTokens.reduce((acc, token) => (t.includes(token) ? acc + 1 : acc), 0);
  const trimHits = trimTokens.reduce((acc, token) => (t.includes(token) ? acc + 1 : acc), 0);
  return { codeHits, trimHits };
}

function compMatchesPhoneQuery(title, query) {
  const q = extractPhoneAttributes(query);
  if (!q.model && !q.storageGb) return true;
  const t = normalizeText(title);
  if (q.model) {
    const modelTokens = tokenize(q.model).filter((token) => !["gen", "generation"].includes(token));
    if (modelTokens.length) {
      const titleTokenSet = new Set(tokenize(t));
      const modelHits = modelTokens.reduce((acc, token) => (titleTokenSet.has(token) ? acc + 1 : acc), 0);
      const neededHits = Math.max(1, Math.ceil(modelTokens.length * 0.6));
      if (modelHits < neededHits) return false;
    }
  }
  if (q.storageGb) {
    const titleStorageGb = extractStorageCapacityGb(t);
    if (Number.isFinite(titleStorageGb) && Math.abs(titleStorageGb - q.storageGb) > 1) return false;
  }
  return true;
}

function extractCollectibleAttributes(text) {
  const raw = String(text || "");
  const t = normalizeText(text);
  const year = extractYear(t);
  const isCoin = /\b(coin|pound|pence|penny|cent|dollar|quarter)\b/.test(t);
  let denomination = null;
  if (/\b(one pound|1 pound|£1)\b/i.test(raw)) denomination = "one_pound";
  else if (/\b(two pound|2 pound|£2)\b/i.test(raw)) denomination = "two_pound";
  else if (/\b(50p|fifty pence)\b/i.test(raw)) denomination = "fifty_pence";
  else if (/\b(20p|twenty pence)\b/i.test(raw)) denomination = "twenty_pence";
  return {
    year,
    isCoin,
    denomination,
  };
}

function compMatchesCollectibleQuery(title, query) {
  const q = extractCollectibleAttributes(query);
  if (!q.isCoin && !q.year && !q.denomination) return true;
  const rawTitle = String(title || "");
  const t = normalizeText(title);
  if (q.isCoin && !/\b(coin|pound|pence|penny|cent|dollar|quarter)\b/.test(t)) return false;
  if (q.year && !new RegExp(`\\b${q.year}\\b`).test(t)) return false;
  if (q.denomination === "one_pound" && !/\b(one pound|1 pound|£1)\b/i.test(rawTitle)) return false;
  if (q.denomination === "two_pound" && !/\b(two pound|2 pound|£2)\b/i.test(rawTitle)) return false;
  if (q.denomination === "fifty_pence" && !/\b(50p|fifty pence)\b/i.test(rawTitle)) return false;
  if (q.denomination === "twenty_pence" && !/\b(20p|twenty pence)\b/i.test(rawTitle)) return false;
  return true;
}

function applyConfidenceRangePolicy({ low, median, high, confidenceLabel }) {
  if (!Number.isFinite(median)) return { low, median, high };
  const m = Number(median);
  const currentLow = Number.isFinite(low) ? Number(low) : m * 0.9;
  const currentHigh = Number.isFinite(high) ? Number(high) : m * 1.1;
  const spread = Math.max(1, currentHigh - currentLow);
  const spreadPct = spread / Math.max(1, m);

  let targetPct = spreadPct;
  if (confidenceLabel === "high") targetPct = Math.max(0.08, Math.min(spreadPct, 0.22));
  else if (confidenceLabel === "medium") targetPct = Math.max(0.18, Math.min(spreadPct, 0.4));
  else targetPct = Math.max(0.32, Math.min(spreadPct, 0.9));

  const half = (m * targetPct) / 2;
  return {
    low: m - half,
    median: m,
    high: m + half,
  };
}

function sanitizePriceBand({ low, median, high, category }) {
  const m = Number(median);
  if (!Number.isFinite(m) || m <= 0) {
    return { low: null, median: null, high: null };
  }
  const cat = String(category || "").toLowerCase();
  const floor = cat === "vehicle" ? 50 : 1;
  let l = Number.isFinite(low) ? Number(low) : m * 0.85;
  let h = Number.isFinite(high) ? Number(high) : m * 1.15;
  l = Math.max(floor, l);
  h = Math.max(l * 1.02, h);
  let mid = m;
  if (mid < l) mid = l;
  if (mid > h) mid = (l + h) / 2;
  return {
    low: Number(l.toFixed(2)),
    median: Number(mid.toFixed(2)),
    high: Number(h.toFixed(2)),
  };
}

function applyCalibrationFactor({ category, region, low, median, high }) {
  const categoryRegionKey = `${String(category || "").toLowerCase()}|${String(region || "").toLowerCase()}`;
  const staticFactorMap = {
    "electronics|uk": 1.015,
  };
  const staticFactor = Number(staticFactorMap[categoryRegionKey] || 1);
  const store = loadOutcomeStore();
  const key = `${category}|${region}`;
  const factor = Number(store?.calibration?.[key]?.factor || 1);
  const clamp = Math.max(0.7, Math.min(1.3, factor * staticFactor));
  return {
    factor: clamp,
    low: Number.isFinite(low) ? low * clamp : low,
    median: Number.isFinite(median) ? median * clamp : median,
    high: Number.isFinite(high) ? high * clamp : high,
  };
}

function applyVehicleMakeModelCalibration({
  low,
  median,
  high,
  make,
  model,
  region,
  year,
  mileage,
  query,
  soldCompsBenchmark,
}) {
  if (!Number.isFinite(median) || median <= 0) {
    return { low, median, high, applied: false, factor: 1, reason: null };
  }
  const makeNorm = normalizeCarText(make);
  const modelNorm = normalizeCarText(model);
  if (!makeNorm || !modelNorm) {
    return { low, median, high, applied: false, factor: 1, reason: null };
  }

  let summary = soldCompsBenchmark || null;
  if (!summary || !Number.isFinite(Number(summary.median)) || Number(summary.count || 0) < 8) {
    const lookup = lookupCarSoldComps({
      make: makeNorm,
      model: modelNorm,
      region: region || "uk",
      year: Number.isFinite(year) ? Number(year) : null,
      mileage: Number.isFinite(mileage) ? Number(mileage) : null,
      query: query || "",
      limit: 120,
    });
    summary = lookup?.summary || null;
  }
  if (!summary || !Number.isFinite(Number(summary.median)) || Number(summary.count || 0) < 8) {
    return { low, median, high, applied: false, factor: 1, reason: null };
  }

  const target = Number(summary.median);
  const sampleCount = Number(summary.count || 0);
  const weight = Math.max(0.15, Math.min(0.42, sampleCount / 160));
  const adjustedMedian = median * (1 - weight) + target * weight;
  const factorRaw = adjustedMedian / Math.max(1, median);
  const factor = Math.max(0.78, Math.min(1.28, factorRaw));
  return {
    low: Number.isFinite(low) ? low * factor : low,
    median: median * factor,
    high: Number.isFinite(high) ? high * factor : high,
    applied: true,
    factor,
    reason: `make/model calibration applied (${makeNorm} ${modelNorm})`,
  };
}

function fingerprintFromQuery({ query, labels, category, condition, region, vehicleYear }) {
  const tokens = tokenize(query).slice(0, 4);
  const modelTokens = getModelTokens(tokens).slice(0, 2);
  const keyParts = [
    category || "general",
    region || "us",
    condition || "used",
    Number.isFinite(vehicleYear) ? String(vehicleYear) : "",
    ...modelTokens.length ? modelTokens : tokens,
  ].filter(Boolean);
  const key = keyParts.join("|");
  return {
    key,
    tokens: tokens.slice(0, 6),
    labels: (labels || []).slice(0, 5),
  };
}

function applyMemoryPrior({ category, region, fingerprintKey, median }) {
  if (!Number.isFinite(median) || !fingerprintKey) {
    return { median, prior: null, adjustmentFactor: 1 };
  }
  const store = loadOutcomeStore();
  const priorKey = `${category}|${region}|${fingerprintKey}`;
  const prior = store?.priors?.[priorKey];
  if (!prior || !Number.isFinite(prior.median)) {
    return { median, prior: null, adjustmentFactor: 1 };
  }
  const priorMedian = Number(prior.median);
  const samples = Math.max(0, Number(prior.samples || 0));
  const updatedAtMs = Date.parse(String(prior.updatedAt || ""));
  const ageDays = Number.isFinite(updatedAtMs)
    ? Math.max(0, (Date.now() - updatedAtMs) / (24 * 60 * 60 * 1000))
    : null;
  const ratio = priorMedian / Math.max(1, Number(median));
  const divergence = Number.isFinite(ratio) && ratio > 0
    ? Math.max(ratio, 1 / ratio)
    : 1;

  let weight = Math.min(0.2, 0.05 + samples * 0.01);
  if (category === "collectible") {
    weight = Math.min(weight, 0.08);
  } else if (category === "electronics" || category === "fashion" || category === "tools" || category === "home") {
    weight = Math.min(weight, 0.14);
  }
  if (Number.isFinite(ageDays) && ageDays > 45) weight *= 0.65;
  if (Number.isFinite(ageDays) && ageDays > 120) weight *= 0.45;
  if (divergence > 2.2) weight *= 0.12;
  else if (divergence > 1.6) weight *= 0.45;

  const adjusted = median * (1 - weight) + priorMedian * weight;
  const factor = adjusted / Math.max(1, median);
  return {
    median: adjusted,
    prior: {
      key: priorKey,
      samples: Number(prior.samples || 0),
      median: Number(prior.median),
      updatedAt: prior.updatedAt || null,
    },
    adjustmentFactor: factor,
  };
}

function updateMemoryPrior({ category, region, fingerprintKey, median }) {
  if (!Number.isFinite(median) || !fingerprintKey) return;
  const store = loadOutcomeStore();
  const priorKey = `${category}|${region}|${fingerprintKey}`;
  const prev = store?.priors?.[priorKey];
  const prevMedian = Number(prev?.median || median);
  const prevSamples = Number(prev?.samples || 0);
  const nextSamples = Math.min(5000, prevSamples + 1);
  const alpha = prevSamples > 40 ? 0.08 : prevSamples > 15 ? 0.12 : 0.18;
  const nextMedian = prevSamples > 0 ? prevMedian * (1 - alpha) + median * alpha : median;
  store.priors[priorKey] = {
    median: nextMedian,
    samples: nextSamples,
    updatedAt: new Date().toISOString(),
  };
  saveOutcomeStore();
}

function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "for", "with", "to", "of", "in", "on", "at",
  "item", "price", "sale", "new", "used", "good", "condition",
]);

function tokenize(s) {
  return normalizeText(s)
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

function getModelTokens(tokens) {
  return tokens.filter((t) => /\d/.test(t) || /[a-z]+\d+|\d+[a-z]+/.test(t));
}

function overlapRatio(queryTokens, titleTokens) {
  if (!queryTokens.length || !titleTokens.length) return 0;
  const titleSet = new Set(titleTokens);
  let hits = 0;
  for (const t of queryTokens) {
    if (titleSet.has(t)) hits += 1;
  }
  return hits / queryTokens.length;
}

function conditionPenalty(condition, title) {
  const t = normalizeText(title);
  if (condition === "used") {
    if (t.includes("new")) return 0.9;
    return 0;
  }
  if (condition === "new") {
    if (t.includes("used") || t.includes("pre owned") || t.includes("pre-owned") || t.includes("refurb")) {
      return 0.8;
    }
  }
  return 0;
}

function scoreCompMatch(baseQuery, condition, title) {
  const queryTokens = tokenize(baseQuery);
  const titleTokens = tokenize(title);
  const ratio = overlapRatio(queryTokens, titleTokens);

  const queryModelTokens = getModelTokens(queryTokens);
  const titleSet = new Set(titleTokens);
  const modelHits = queryModelTokens.filter((t) => titleSet.has(t)).length;
  const modelRequired = queryModelTokens.length > 0;
  const modelOk = !modelRequired || modelHits >= Math.ceil(queryModelTokens.length * 0.6);

  let score = ratio * 100;
  if (modelRequired) {
    score += (modelHits / Math.max(1, queryModelTokens.length)) * 35;
    if (!modelOk) score -= 45;
  }
  score -= conditionPenalty(condition, title) * 100;
  return Math.max(0, Math.min(100, score));
}

function dedupeAndSanityFilter(comps) {
  const seen = new Set();
  const cleaned = [];
  for (const c of comps) {
    const normTitle = normalizeText(c.title).replace(/\s+/g, " ").trim();
    const key = `${normTitle}|${String(c.source || "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (Number.isFinite(c.n)) {
      if (c.n <= 0) continue;
      if (c.n > 10000000) continue;
    }
    cleaned.push(c);
  }
  return cleaned;
}

function isVehicleQuery(q) {
  const t = normalizeText(q);
  return ["range rover", "car", "truck", "suv", "sedan", "hatchback", "van", "bmw", "audi", "mercedes", "toyota", "ford", "honda", "tire", "tyre", "wheel", "alloy", "rim"].some((k) =>
    t.includes(k)
  );
}

function detectCategory(baseQuery, labels = []) {
  const text = normalizeText(`${baseQuery} ${labels.join(" ")}`);
  if (isVehicleQuery(text)) return "vehicle";
  if (["iphone", "ipad", "macbook", "laptop", "camera", "console", "playstation", "xbox", "nintendo", "gpu", "headphones"].some((k) => text.includes(k))) {
    return "electronics";
  }
  if (["nike", "adidas", "jordan", "yeezy", "sneaker", "watch", "rolex", "bag", "handbag", "tiffany", "necklace", "bracelet", "ring", "earrings", "jewelry"].some((k) => text.includes(k))) {
    return "fashion";
  }
  if (["sofa", "chair", "table", "desk", "dresser", "bed", "wardrobe", "lamp", "appliance", "fridge", "washer"].some((k) => text.includes(k))) {
    return "home";
  }
  if (
    [
      "pokemon", "psa", "tcg", "card", "comic", "lego", "coin", "50p", "banknote", "note", "stamp",
      "book", "isbn", "first edition", "signed", "vintage", "antique", "collectible",
      "rock", "mineral", "crystal", "gemstone", "fossil",
    ].some((k) => text.includes(k))
  ) {
    return "collectible";
  }
  if (["drill", "saw", "tool", "dewalt", "milwaukee", "makita", "generator", "compressor"].some((k) => text.includes(k))) {
    return "tools";
  }
  return "general";
}

function extractLikelyBarcodeOrIsbn(text) {
  const raw = String(text || "");
  if (!raw) return null;

  const isbnTagged = raw.match(/isbn(?:-1[03])?\s*[:#]?\s*([0-9xX\- ]{10,24})/i);
  if (isbnTagged?.[1]) {
    const compact = isbnTagged[1].replace(/[^0-9xX]/g, "").toUpperCase();
    if (compact.length === 10 || compact.length === 13) {
      return { type: "isbn", code: compact };
    }
  }

  const digitRuns = raw.match(/\b\d{8,14}\b/g) || [];
  const isbn13 = digitRuns.find((x) => x.length === 13 && (x.startsWith("978") || x.startsWith("979")));
  if (isbn13) return { type: "isbn", code: isbn13 };

  const barcode = digitRuns.find((x) => x.length === 8 || x.length === 12 || x.length === 13 || x.length === 14);
  if (barcode) return { type: "barcode", code: barcode };

  return null;
}

async function fetchJsonWithTimeout(url, timeoutMs = BARCODE_ENRICH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) return null;
    return await resp.json().catch(() => null);
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function lookupBookByIsbn(isbn) {
  const code = String(isbn || "").replace(/[^0-9xX]/g, "").toUpperCase();
  if (!(code.length === 10 || code.length === 13)) return null;

  const apiUrl = `https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(code)}&jscmd=data&format=json`;
  const payload = await fetchJsonWithTimeout(apiUrl);
  const row = payload?.[`ISBN:${code}`];
  const title = String(row?.title || "").trim();
  if (!title) return null;
  const author = Array.isArray(row?.authors) ? String(row.authors[0]?.name || "").trim() : "";
  const publishYear = String(row?.publish_date || "").match(/\b(19|20)\d{2}\b/)?.[0] || "";
  const query = [title, author, publishYear, "book"].filter(Boolean).join(" ").trim();
  return query || null;
}

async function lookupProductByBarcode(code) {
  const barcode = String(code || "").replace(/\D/g, "");
  if (barcode.length < 8 || barcode.length > 14) return null;

  const apiUrl = `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`;
  const payload = await fetchJsonWithTimeout(apiUrl);
  if (Number(payload?.status) !== 1) return null;
  const product = payload?.product || {};
  const name = String(product?.product_name_en || product?.product_name || "").trim();
  if (!name) return null;
  const brand = String(product?.brands || "").split(",")[0].trim();
  const qty = String(product?.quantity || "").trim();
  const query = [name, brand, qty].filter(Boolean).join(" ").trim();
  return query || null;
}

async function enrichQueryFromBarcodeSignals({
  manualItemQuery,
  baseQuery,
  conditionNotes,
  labels,
}) {
  const merged = [manualItemQuery, baseQuery, conditionNotes, ...(Array.isArray(labels) ? labels : [])]
    .filter(Boolean)
    .join(" ");
  const signal = extractLikelyBarcodeOrIsbn(merged);
  if (!signal) return null;

  if (signal.type === "isbn") {
    const isbnQuery = await lookupBookByIsbn(signal.code);
    if (isbnQuery) {
      return {
        query: isbnQuery,
        categoryHint: "collectible",
        source: "openlibrary_isbn",
        code: signal.code,
      };
    }
    return {
      query: `ISBN ${signal.code} book`,
      categoryHint: "collectible",
      source: "isbn_fallback",
      code: signal.code,
    };
  }

  const productQuery = await lookupProductByBarcode(signal.code);
  if (productQuery) {
    return {
      query: productQuery,
      categoryHint: "general",
      source: "openfoodfacts_barcode",
      code: signal.code,
    };
  }
  return {
    query: `barcode ${signal.code} product`,
    categoryHint: "general",
    source: "barcode_fallback",
    code: signal.code,
  };
}

function extractTechAttributes(text) {
  const t = normalizeText(text);
  const storage = t.match(/\b(32|64|128|256|512|1024)\s?(gb|tb)\b/);
  const ram = t.match(/\b(4|6|8|12|16|24|32|64)\s?gb\s?ram\b/);
  const battery = t.match(/\b(\d{2,3})\s?%\s?(battery|health)\b/);
  return {
    storage: storage ? `${storage[1]}${storage[2]}`.toUpperCase() : null,
    ramGb: ram ? Number(ram[1]) : null,
    batteryHealthPct: battery ? Number(battery[1]) : null,
  };
}

function extractCardAttributes(text) {
  const t = normalizeText(text);
  const grade = t.match(/\b(psa|bgs|cgc)\s?(\d(?:\.\d)?)\b/);
  const set = t.match(/\b(base set|jungle|fossil|neo genesis|scarlet violet|sv\d+)\b/);
  const cardNo = t.match(/\b(\d{1,3}\/\d{1,3})\b/);
  const firstEdition = /\b1st edition|first edition\b/.test(t);
  const holo = /\bholo|holographic|reverse holo\b/.test(t);
  return {
    grading: grade ? `${grade[1].toUpperCase()} ${grade[2]}` : null,
    set: set ? set[1] : null,
    cardNumber: cardNo ? cardNo[1] : null,
    firstEdition,
    holo,
  };
}

function routeCategoryFromItemProfile(profile) {
  const text = normalizeText(`${profile?.query || ""} ${(profile?.labels || []).join(" ")}`);
  if (profile?.category && profile.category !== "auto") return profile.category;
  if (profile?.vehicle?.registration || /(vin|mot|tax|mileage|service history)/.test(text)) return "vehicle";
  if (profile?.card?.set || /\b(pokemon|psa|graded card|tcg|card)\b/.test(text)) return "collectible";
  if (/\b(coin|50p|banknote|note|book|isbn|rock|mineral|crystal|fossil|gemstone)\b/.test(text)) return "collectible";
  if (profile?.tech?.storage || profile?.tech?.ramGb || /(iphone|ipad|macbook|laptop|gpu|console)/.test(text)) return "electronics";
  if (profile?.tool?.voltage || profile?.tool?.brand || /\b(drill|impact|saw|tool|dewalt|milwaukee|makita)\b/.test(text)) return "tools";
  return detectCategory(profile?.query || "", profile?.labels || []);
}

function buildUniversalItemProfile({
  query,
  labels,
  category,
  region,
  condition,
  conditionTier,
  vehicleMake,
  vehicleModel,
  vehicleYear,
  vehicleMileage,
  vehicleReg,
}) {
  const normalizedQuery = String(query || "").trim();
  const tech = extractTechAttributes(normalizedQuery);
  const tool = extractToolAttributes(normalizedQuery);
  const card = extractCardAttributes(normalizedQuery);
  const routedCategory = routeCategoryFromItemProfile({
    query: normalizedQuery,
    labels: labels || [],
    category,
    tech,
    tool,
    card,
    vehicle: { registration: vehicleReg || null },
  });
  return {
    schemaVersion: "1.0",
    query: normalizedQuery,
    labels: (labels || []).slice(0, 10),
    categoryRequested: category || "auto",
    categoryRouted: routedCategory,
    region: region || "us",
    condition: condition || "used",
    conditionTier: conditionTier || "good",
    tech,
    tool,
    card,
    vehicle: {
      make: vehicleMake || null,
      model: vehicleModel || null,
      year: Number.isFinite(Number(vehicleYear)) && Number(vehicleYear) > 1900 ? Number(vehicleYear) : null,
      mileage: Number.isFinite(Number(vehicleMileage)) && Number(vehicleMileage) > 0 ? Number(vehicleMileage) : null,
      registration: vehicleReg || null,
    },
  };
}

function lookupManualSoldComps({ category, query, region = "uk", limit = 60 }) {
  const categoryNorm = normalizeText(category || "general");
  const targetRegion = String(region || "uk").toLowerCase();
  const currencyByRegion = {
    uk: "GBP",
    us: "USD",
    eu: "EUR",
    au: "AUD",
    ca: "CAD",
  };
  const targetCurrency = currencyByRegion[targetRegion] || "GBP";
  const queryTokens = tokenize(query).slice(0, 8);
  const all = parseManualSoldCompsFile();
  let rows = all.filter((x) => x.category === categoryNorm || (categoryNorm === "general" && x.category));
  if (queryTokens.length) {
    const minScore = queryTokens.length >= 3 ? 2 : 1;
    const strictMatchCategory = new Set(["fashion", "electronics", "tools", "collectible"]).has(categoryNorm);
    rows = rows
      .map((x) => {
        const hayTokens = new Set(tokenize(`${x.titleNorm} ${x.brandNorm} ${x.modelNorm}`));
        const overlap = queryTokens.reduce((acc, token) => (hayTokens.has(token) ? acc + 1 : acc), 0);
        const modelBoost = x.modelNorm && queryTokens.some((token) => x.modelNorm.includes(token)) ? 2 : 0;
        const brandBoost = x.brandNorm && queryTokens.some((token) => x.brandNorm.includes(token)) ? 1 : 0;
        return { row: x, score: overlap + modelBoost + brandBoost, overlap, modelBoost, brandBoost };
      })
      .filter((x) => {
        if (strictMatchCategory) {
          return (
            x.overlap >= 2 ||
            (x.modelBoost > 0 && x.overlap >= 1) ||
            (x.brandBoost > 0 && x.overlap >= 1)
          );
        }
        return x.score >= minScore;
      })
      .sort((a, b) => b.score - a.score)
      .map((x) => x.row);
  }
  rows = rows
    .map((x) => {
      const convertedPrice = toTargetCurrency(x.soldPrice, x.currency, targetCurrency);
      return Number.isFinite(convertedPrice) && convertedPrice > 0
        ? {
            ...x,
            soldPrice: Number(convertedPrice.toFixed(2)),
            currency: targetCurrency,
          }
        : null;
    })
    .filter(Boolean)
    .slice(0, Math.max(10, limit));
  if (!rows.length) return { comps: [], summary: null };
  const prices = rows.map((x) => x.soldPrice).sort((a, b) => a - b);
  return {
    comps: rows,
    summary: {
      count: rows.length,
      low: percentileFromSorted(prices, 0.1),
      median: percentileFromSorted(prices, 0.5),
      high: percentileFromSorted(prices, 0.9),
      currency: targetCurrency,
      source: "manual",
      loadedAt: manualSoldCompsLoadedAt,
    },
  };
}

function lookupUnifiedSoldComps({ category, query, vehicle, region = "uk" }) {
  if (category === "vehicle") {
    const parsedVehicle = parseMakeModelFromVehicleQuery(query, vehicle?.make, vehicle?.model);
    const out = lookupCarSoldComps({
      make: parsedVehicle.make,
      model: parsedVehicle.model,
      region,
      year: vehicle?.year || null,
      mileage: vehicle?.mileage || null,
      limit: 80,
      query,
    });
    return {
      source: out?.summary ? "soldcartracker" : null,
      summary: out?.summary || null,
      comps: out?.comps || [],
      context: { make: parsedVehicle.make || null, model: parsedVehicle.model || null },
    };
  }
  const manual = lookupManualSoldComps({ category, query, region, limit: 80 });
  return {
    source: manual?.summary ? "manual" : null,
    summary: manual?.summary || null,
    comps: manual?.comps || [],
    context: null,
  };
}

function blendEstimateWithSoldBenchmark({ low, median, high, soldSummary, category }) {
  if (!soldSummary || !Number.isFinite(Number(soldSummary.median))) {
    return { low, median, high, applied: false, factor: 1, reason: null };
  }
  if (!Number.isFinite(median) || median <= 0) {
    return {
      low: Number(soldSummary.low || soldSummary.median),
      median: Number(soldSummary.median),
      high: Number(soldSummary.high || soldSummary.median),
      applied: true,
      factor: 1,
      reason: "live estimate unavailable; using sold benchmark",
    };
  }
  const count = Number(soldSummary.count || 0);
  const source = String(soldSummary.source || "").toLowerCase();
  let soldWeight = Math.max(0.15, Math.min(0.55, count / 220));
  if (category === "vehicle" && source === "soldcartracker") {
    if (count >= 20) soldWeight = 0.82;
    else if (count >= 10) soldWeight = 0.76;
    else if (count >= 6) soldWeight = 0.68;
  }
  if (source === "manual") {
    if (category === "collectible") {
      soldWeight = 1;
    } else if (count >= 5) soldWeight = 0.97;
    else if (count >= 3) soldWeight = 0.9;
    else if (count >= 2) soldWeight = 0.82;
    else soldWeight = 0.72;
  }
  const liveWeight = 1 - soldWeight;
  const blendedMedian = median * liveWeight + Number(soldSummary.median) * soldWeight;
  const factor = blendedMedian / Math.max(1, median);
  const nextLow = Number.isFinite(low) ? low * factor : Number(soldSummary.low || soldSummary.median);
  const nextHigh = Number.isFinite(high) ? high * factor : Number(soldSummary.high || soldSummary.median);
  return {
    low: nextLow,
    median: blendedMedian,
    high: nextHigh,
    applied: true,
    factor,
    reason: `blended live estimate with sold comps (${category})`,
  };
}

function buildQueryCandidates(category, enriched, baseQuery, region = "us") {
  const isUk = String(region || "").toLowerCase() === "uk";
  const ebayDomain = isUk ? "ebay.co.uk" : "ebay.com";
  const localMarketDomain = isUk ? "gumtree.com" : "craigslist.org";
  if (category === "vehicle") {
    const isTyreQuery = /\b(tire|tyre|wheel|rim|alloy)\b/.test(normalizeText(baseQuery));
    if (isTyreQuery) {
      return unique([
        `${enriched} used tire price`,
        `${enriched} used tyre price`,
        `${enriched} set of 4 tires for sale`,
        `${enriched} site:${isUk ? "ebay.co.uk" : "ebay.com"}`,
        `${enriched} site:facebook.com marketplace`,
        baseQuery,
      ]);
    }
    if (isUk) {
      return unique([
        `${enriched} site:autotrader.co.uk`,
        `${enriched} used cars for sale uk`,
        `${enriched} private sale value uk`,
        `${enriched} market value uk`,
        `${enriched} site:motors.co.uk`,
        `${enriched} site:facebook.com marketplace`,
        baseQuery,
      ]);
    }
    return unique([
      `${enriched} market value`,
      `${enriched} private sale price`,
      `${enriched} site:autotrader.com`,
      `${enriched} site:cars.com`,
      `${enriched} site:facebook.com marketplace`,
      baseQuery,
    ]);
  }
  if (category === "electronics") {
    return unique([
      `${enriched} sold price`,
      `${enriched} resale value`,
      `${enriched} site:${ebayDomain} sold`,
      `${enriched} site:${isUk ? "webuy.com" : "swappa.com"}`,
      `${enriched} site:facebook.com marketplace`,
      baseQuery,
    ]);
  }
  if (category === "fashion") {
    return unique([
      `${enriched} tiffany necklace price`,
      `${enriched} resale price`,
      `${enriched} site:${ebayDomain} sold`,
      `${enriched} site:${isUk ? "vinted.co.uk" : "theRealReal.com"}`,
      `${enriched} site:${isUk ? "vestiairecollective.com" : "stockx.com"}`,
      `${enriched} site:goat.com`,
      `${enriched} site:facebook.com marketplace`,
      baseQuery,
    ]);
  }
  if (category === "home") {
    return unique([
      `${enriched} used price`,
      `${enriched} resale value`,
      `${enriched} site:facebook.com marketplace`,
      `${enriched} site:${localMarketDomain}`,
      `${enriched} site:${ebayDomain}`,
      baseQuery,
    ]);
  }
  if (category === "collectible") {
    return unique([
      `${enriched} sold price`,
      `${enriched} recent sales`,
      `${enriched} site:${ebayDomain} sold`,
      `${enriched} site:${isUk ? "cardmarket.com" : "pricecharting.com"}`,
      `${enriched} site:130point.com`,
      baseQuery,
    ]);
  }
  if (category === "tools") {
    return unique([
      `${enriched} used price`,
      `${enriched} resale value`,
      `${enriched} site:facebook.com marketplace`,
      `${enriched} site:${ebayDomain} sold`,
      `${enriched} site:${localMarketDomain}`,
      baseQuery,
    ]);
  }
  return unique([
    `${enriched} market value`,
    `${enriched} for sale`,
    `${enriched} price`,
    `${enriched} site:${ebayDomain}`,
    `${enriched} site:facebook.com marketplace`,
    baseQuery,
  ]);
}

function buildVehicleRescueQueries({ baseQuery, make, model, year }) {
  const core = [make, model, Number.isFinite(Number(year)) ? String(Number(year)) : ""]
    .filter(Boolean)
    .join(" ")
    .trim();
  const fallback = core || String(baseQuery || "").trim();
  return unique([
    `${fallback} used car price uk`,
    `${fallback} private sale value uk`,
    `${fallback} autotrader price`,
  ]).filter(Boolean);
}

function fallbackBaselineByCategory(category, region) {
  const byRegion = {
    us: { vehicle: 6500, electronics: 280, fashion: 140, home: 220, collectible: 160, tools: 180, general: 150 },
    uk: { vehicle: 5200, electronics: 230, fashion: 120, home: 180, collectible: 130, tools: 150, general: 120 },
    eu: { vehicle: 6000, electronics: 250, fashion: 130, home: 200, collectible: 140, tools: 170, general: 130 },
    ca: { vehicle: 7000, electronics: 300, fashion: 150, home: 240, collectible: 170, tools: 190, general: 160 },
    au: { vehicle: 7500, electronics: 320, fashion: 160, home: 250, collectible: 180, tools: 200, general: 170 },
  };
  const r = byRegion[region] || byRegion.us;
  return Number(r[category] || r.general);
}

function queryFallbackAnchor({ query, category, region }) {
  const q = normalizeText(query || "");
  if (!q) return null;
  const rfMap = { uk: 1, us: 1.08, eu: 1.04, ca: 1.14, au: 1.2 };
  const regionFactor = Number(rfMap[String(region || "").toLowerCase()] || 1);
  const scale = (n) => Number((Number(n) * regionFactor).toFixed(2));
  const pack = (median, opts = {}) => {
    const lowFactor = Number(opts.lowFactor || 0.72);
    const highFactor = Number(opts.highFactor || 1.32);
    return {
      low: scale(median * lowFactor),
      median: scale(median),
      high: scale(median * highFactor),
      confidenceScore: Number(opts.confidenceScore || 52),
      reason: String(opts.reason || "query-specific fallback anchor"),
    };
  };

  if (category === "electronics" || category === "general") {
    if (/\bmacbook\s*pro\b/.test(q) && /\bm1\b/.test(q) && /\b(2020|13)\b/.test(q)) {
      return pack(620, {
        lowFactor: 0.8,
        highFactor: 1.22,
        confidenceScore: 58,
        reason: "MacBook Pro M1 resale anchor",
      });
    }
    if (/\bmacbook\s*air\b/.test(q) && /\bm1\b/.test(q)) {
      return pack(530, {
        lowFactor: 0.8,
        highFactor: 1.24,
        confidenceScore: 57,
        reason: "MacBook Air M1 resale anchor",
      });
    }
    if (/\bmacbook\b/.test(q)) {
      return pack(490, {
        lowFactor: 0.78,
        highFactor: 1.24,
        confidenceScore: 54,
        reason: "MacBook resale anchor",
      });
    }
    if (/\bipad\b/.test(q) && /\b(9th|9|10th|10)\b/.test(q) && /\b(64\s?gb|64gb)\b/.test(q)) {
      return pack(185, {
        lowFactor: 0.78,
        highFactor: 1.25,
        confidenceScore: 56,
        reason: "iPad baseline resale anchor",
      });
    }
    if (/\blaptop\b/.test(q) || /\bnotebook\b/.test(q)) {
      return pack(340, {
        lowFactor: 0.74,
        highFactor: 1.34,
        confidenceScore: 50,
        reason: "generic laptop resale anchor",
      });
    }
  }

  if (/\b(book|novel|paperback|hardcover|isbn|first edition|signed copy)\b/.test(q)) {
    const rareBook =
      /\b(first edition|signed|limited edition|rare|out of print|collectors? edition)\b/.test(q);
    return pack(rareBook ? 34 : 9, {
      lowFactor: rareBook ? 0.72 : 0.66,
      highFactor: rareBook ? 1.45 : 1.55,
      confidenceScore: rareBook ? 58 : 50,
      reason: rareBook ? "rare book resale anchor" : "book resale anchor",
    });
  }

  if (
    /\b(coin|50p|fifty p|2 pound|two pound|pound coin|banknote|note)\b/.test(q)
  ) {
    if (/\bkew gardens\b/.test(q) && /\b50p\b/.test(q)) {
      return pack(140, {
        lowFactor: 0.62,
        highFactor: 1.75,
        confidenceScore: 63,
        reason: "kew gardens 50p collector anchor",
      });
    }
    const rareCoin =
      /\b(rare|kew gardens|olympic|beatrix potter|error coin|minting error|proof|uncirculated|silver)\b/.test(q);
    return pack(rareCoin ? 65 : 6, {
      lowFactor: rareCoin ? 0.62 : 0.58,
      highFactor: rareCoin ? 1.95 : 1.9,
      confidenceScore: rareCoin ? 60 : 48,
      reason: rareCoin ? "rare coin/note anchor" : "coin/note anchor",
    });
  }

  if (/\b(rock|mineral|crystal|gemstone|fossil|geode|quartz)\b/.test(q)) {
    const premiumSpecimen = /\b(rare|museum|large|polished|collector|natural)\b/.test(q);
    return pack(premiumSpecimen ? 45 : 18, {
      lowFactor: 0.64,
      highFactor: premiumSpecimen ? 1.7 : 1.55,
      confidenceScore: premiumSpecimen ? 56 : 50,
      reason: premiumSpecimen ? "collector specimen anchor" : "rocks/minerals resale anchor",
    });
  }

  if (
    /\b(vodka|whisky|whiskey|bourbon|scotch|rum|tequila|gin|cognac|brandy|liqueur)\b/.test(q) &&
    /\b(bottle|sealed|unopened|70cl|700ml|750ml|1l)\b/.test(q)
  ) {
    const premiumSpiritBrand =
      /\b(grey\s*goose|belvedere|ciroc|hendrick'?s|tanqueray\s*no\.?\s*10|johnnie\s*walker|glenfiddich|macallan)\b/.test(q);
    return pack(premiumSpiritBrand ? 28 : 20, {
      lowFactor: 0.68,
      highFactor: 1.42,
      confidenceScore: premiumSpiritBrand ? 56 : 52,
      reason: "sealed spirits retail anchor",
    });
  }

  if (
    /\b(cider|beer|lager|ale|wine|prosecco|champagne|soft drink|soda|juice|cola|energy drink)\b/.test(q)
  ) {
    return pack(3.4, {
      lowFactor: 0.6,
      highFactor: 1.7,
      confidenceScore: 48,
      reason: "packaged drink retail anchor",
    });
  }

  if (/\b(biscuit|biscuits|cookie|cookies|cracker|snack|crisps|chips|chocolate|candy|sweet)\b/.test(q)) {
    return pack(2.4, {
      lowFactor: 0.58,
      highFactor: 1.75,
      confidenceScore: 47,
      reason: "packaged snack retail anchor",
    });
  }

  if (
    /\b(nutella|chocolate spread|peanut butter|jam|marmalade|cereal|pasta|rice|sauce|ketchup|mayonnaise|beans|soup|coffee|tea|breakfast cereal)\b/.test(q)
  ) {
    return pack(3.8, {
      lowFactor: 0.6,
      highFactor: 1.7,
      confidenceScore: 49,
      reason: "packaged grocery retail anchor",
    });
  }

  return null;
}

function applyCollectibleFloorGuard({ query, category, region, low, median, high }) {
  if (category !== "collectible") return null;
  if (!Number.isFinite(Number(median)) || Number(median) <= 0) return null;
  const q = normalizeText(query || "");
  const anchor = queryFallbackAnchor({ query, category, region });
  if (!anchor || !Number.isFinite(Number(anchor.median)) || Number(anchor.median) <= 0) return null;

  const rareCoin =
    /\b(coin|50p|fifty p|2 pound|two pound|pound coin|banknote|note)\b/.test(q) &&
    /\b(rare|kew gardens|olympic|beatrix potter|error coin|minting error|proof|uncirculated|silver)\b/.test(q);
  const rareBook =
    /\b(book|novel|paperback|hardcover|isbn)\b/.test(q) &&
    /\b(first edition|signed|limited edition|rare|out of print|collectors? edition)\b/.test(q);
  const specimen =
    /\b(rock|mineral|crystal|gemstone|fossil|geode|quartz)\b/.test(q) &&
    /\b(rare|museum|large|polished|collector|natural)\b/.test(q);

  let floor = null;
  let reason = "";
  if (rareCoin) {
    floor = Number(anchor.median) * 0.55;
    reason = "rare coin floor guard";
  } else if (rareBook) {
    floor = Number(anchor.median) * 0.6;
    reason = "rare book floor guard";
  } else if (specimen) {
    floor = Number(anchor.median) * 0.5;
    reason = "collector specimen floor guard";
  }
  if (!Number.isFinite(Number(floor)) || Number(floor) <= 0) return null;
  if (Number(median) >= Number(floor)) return null;

  const factor = Number(floor) / Number(median);
  return {
    low: Number.isFinite(Number(low)) ? Number(low) * factor : Number(floor) * 0.72,
    median: Number(floor),
    high: Number.isFinite(Number(high)) ? Number(high) * factor : Number(floor) * 1.35,
    reason,
  };
}

function applyQueryFallbackPricing({
  pricing,
  query,
  category,
  region,
  conditionTier,
  condition,
  market,
  fallbackReason,
}) {
  const anchor = queryFallbackAnchor({ query, category, region });
  if (!anchor) return null;

  const next = { ...(pricing || {}) };
  const cleanBand = sanitizePriceBand({
    low: anchor.low,
    median: anchor.median,
    high: anchor.high,
    category,
  });
  const score = Math.max(
    Number(next?.confidence?.score || 0),
    Number(anchor.confidenceScore || 50)
  );
  const scoreClamped = Math.max(44, Math.min(62, Math.round(score)));
  const spreadPct =
    Number.isFinite(Number(cleanBand.median)) && Number(cleanBand.median) > 0
      ? Math.max(0.05, (Number(cleanBand.high) - Number(cleanBand.low)) / Number(cleanBand.median))
      : 0.9;

  next.low = cleanBand.low;
  next.median = cleanBand.median;
  next.high = cleanBand.high;
  next.finalStatus = "usable";
  next.provisional = false;
  next.provisionalReason = `${fallbackReason || "Live pricing unavailable."} ${anchor.reason}.`;
  next.confidence = {
    score: scoreClamped,
    label: confidenceLabelFromScore(scoreClamped),
  };
  next.confidenceReasons = unique([
    ...(next.confidenceReasons || []),
    "query-specific fallback anchor",
    "live listing provider unavailable",
  ]);
  next.qualityGate = {
    status: "caution",
    score: Math.max(56, Math.min(66, scoreClamped + 6)),
    metrics: { compCount: 0, sourceCount: 1, avgMatchScore: 68, spreadPct },
    reasons: ["using local fallback anchor because live listings are unavailable"],
  };
  next.accuracy = {
    ready: false,
    score: Math.max(52, Math.min(64, scoreClamped + 4)),
    blockers: ["live listings unavailable; anchored fallback estimate used"],
  };
  next.recommendedRetail = estimateRecommendedRetailPrice({
    category,
    query,
    resaleMedian: next.median,
    resaleLow: next.low,
    resaleHigh: next.high,
    conditionTier,
    condition,
    vehicleYear: null,
    currencySymbol: market.symbol,
  });
  return next;
}

function isSerpQuotaError(message) {
  const text = normalizeText(message);
  if (!text) return false;
  return (
    text.includes("run out of searches") ||
    text.includes("out of searches") ||
    text.includes("searches limit") ||
    text.includes("plan limit") ||
    text.includes("monthly limit") ||
    text.includes("quota")
  );
}

function buildProvisionalPricing({
  query,
  category,
  region,
  market,
  conditionTier,
  condition,
  vehicleYear = null,
  confidenceScore = 15,
  reason,
}) {
  const base = fallbackBaselineByCategory(category, region);
  const tierAdj = conditionTierFactor(conditionTier);
  const usedAdj = condition === "used" ? 0.95 : 1.05;
  const provisionalYear = Number.isFinite(Number(vehicleYear))
    ? Number(vehicleYear)
    : (category === "vehicle" ? extractYear(query) : null);
  let median = base * tierAdj.factor * usedAdj;
  if (category === "vehicle" && Number.isFinite(provisionalYear)) {
    const age = Math.max(0, new Date().getFullYear() - Number(provisionalYear));
    let ageBandFactor = 1;
    if (age <= 3) ageBandFactor = 2.0;
    else if (age <= 6) ageBandFactor = 1.45;
    else if (age <= 10) ageBandFactor = 1.05;
    else if (age <= 14) ageBandFactor = 0.68;
    else ageBandFactor = 0.5;
    median *= ageBandFactor;
    const ageAdj = estimateVehicleAdjustment({
      year: provisionalYear,
      mileage: null,
      conditionNotes: "",
      condition,
    });
    median *= ageAdj.factor;
  }
  const low = median * 0.7;
  const high = median * 1.35;
  const recommendedRetail = estimateRecommendedRetailPrice({
    category,
    query,
    resaleMedian: median,
    resaleLow: low,
    resaleHigh: high,
    conditionTier,
    condition,
    vehicleYear: null,
    currencySymbol: market.symbol,
  });
  const provisional = {
    ok: true,
    finalStatus: "needs_details",
    provisional: true,
    provisionalReason: reason || "No close comps available yet.",
    query: query || "Unspecified item",
    category,
    region,
    currency: market.currency,
    currencySymbol: market.symbol,
    low,
    median,
    high,
    recommendedRetail,
    confidence: {
      score: Math.max(5, Math.min(35, confidenceScore)),
      label: "low",
    },
    accuracy: {
      ready: false,
      score: Math.max(10, Math.min(45, confidenceScore)),
      blockers: [reason || "provisional estimate requires stronger market evidence"],
    },
    conditionTier,
    valuationAdjustments: [tierAdj.label, "provisional fallback estimate"],
    sellTime: estimateSellTime({
      category,
      confidenceLabel: "low",
      condition,
      conditionTier,
    }),
    profit: null,
    listingAssistant: buildListingAssistant({
      query: query || "Unspecified item",
      category,
      condition,
      conditionTier,
      conditionNotes: "",
      median,
      low,
      high,
      currencySymbol: market.symbol,
      confidence: "low",
    }),
    liveDataAt: new Date().toISOString(),
    vehicleAdjustments: null,
    recommendations: recommendMarketplaces({
      category,
      region,
      confidenceLabel: "low",
      condition,
    }),
    comps: [],
    fromCache: false,
  };

  if (ACCURACY_STRICT_MODE && category === "vehicle") {
    provisional.low = null;
    provisional.median = null;
    provisional.high = null;
    provisional.confidenceReasons = unique([
      ...(provisional.confidenceReasons || []),
      "vehicle provisional valuation hidden until stronger evidence is available",
    ]);
  }

  return provisional;
}

function withholdProvisionalNumbers(pricing, reason = "low confidence provisional estimate") {
  const next = { ...(pricing || {}) };
  // Optionally hide numeric range for low-confidence vehicles (strict mode only).
  if (String(next.category || "").toLowerCase() === "vehicle" && ACCURACY_STRICT_MODE) {
    next.low = null;
    next.median = null;
    next.high = null;
  }
  next.finalStatus = "needs_details";
  next.confidence = { score: Math.min(Number(next?.confidence?.score || 25), 35), label: "low" };
  const reasons = Array.isArray(next.confidenceReasons) ? next.confidenceReasons.slice(0, 5) : [];
  reasons.push(`low-trust estimate shown: ${reason}`);
  next.confidenceReasons = unique(reasons);
  next.accuracy = {
    ready: false,
    score: Math.min(Number(next?.accuracy?.score || 40), 49),
    blockers: unique([...(next?.accuracy?.blockers || []), reason]),
  };
  return next;
}

function cacheKey({ query, category, region, condition, conditionTier }) {
  return [
    normalizeText(query),
    String(category || ""),
    String(region || ""),
    String(condition || ""),
    String(conditionTier || ""),
  ].join("|");
}

function getCachedPricing(key) {
  const hit = pricingCache.get(key);
  if (!hit) return null;
  const ageMs = Date.now() - hit.savedAt;
  if (ageMs > PRICE_CACHE_TTL_MS) {
    pricingCache.delete(key);
    return null;
  }
  return { pricing: hit.pricing, ageSec: Math.round(ageMs / 1000) };
}

function saveCachedPricing(key, pricing) {
  pricingCache.set(key, {
    savedAt: Date.now(),
    pricing,
  });
}

function liveFallbackQuery(category, conditionNotes) {
  const notes = String(conditionNotes || "").trim();
  if (category === "vehicle") return notes ? `used car ${notes}` : "used car";
  if (category === "electronics") return notes ? `used electronics ${notes}` : "used electronics";
  if (category === "fashion") return notes ? `used jewelry ${notes}` : "used fashion item";
  if (category === "home") return notes ? `used furniture ${notes}` : "used furniture";
  if (category === "collectible") return notes ? `collectible ${notes}` : "collectible item";
  if (category === "tools") return notes ? `used tool ${notes}` : "used power tool";
  return notes ? `used item ${notes}` : "used item for sale";
}

async function detectItemFromImageBuffer(buffer, opts = {}) {
  const client = getVisionClient();
  if (!buffer) {
    return { ok: false, error: "Image detection unavailable on backend." };
  }
  if (!client) {
    if (!OPENAI_API_KEY) {
      return { ok: false, error: "Image detection unavailable on backend." };
    }
    const aiDetected = await detectItemWithOpenAiFromImageBuffer(buffer);
    if (aiDetected?.ok && aiDetected.query) {
      return {
        ok: true,
        query: aiDetected.query,
        category: aiDetected.category || "general",
        labels: [],
        firstTextLine: aiDetected.query,
        logos: [],
        webEntities: [],
        detectionConfidence: "medium",
        aiFallbackUsed: true,
        error: null,
      };
    }
    return { ok: false, error: aiDetected?.error || "Image detection unavailable on backend." };
  }

  try {
    const fast = Boolean(opts.fast);
    const ultraFast = Boolean(opts.ultraFast);
    const [labelRes] = await client.labelDetection({
      image: { content: buffer },
      maxResults: ultraFast ? 4 : 8,
    });
    const logoRes = ultraFast
      ? { logoAnnotations: [] }
      : (await client.logoDetection({
          image: { content: buffer },
          maxResults: 4,
        }))[0];
    const webRes = ultraFast
      ? { webDetection: { webEntities: [] } }
      : (await client.webDetection({
          image: { content: buffer },
        }))[0];
    const objRes = fast
      ? { localizedObjectAnnotations: [] }
      : (await client.objectLocalization({ image: { content: buffer }, maxResults: 5 }))[0];
    const textRes = fast
      ? { fullTextAnnotation: { text: "" } }
      : (await client.textDetection({ image: { content: buffer } }))[0];

    const labels = (labelRes.labelAnnotations || [])
      .filter((l) => Number(l.score || 0) >= 0.6)
      .map((l) => String(l.description || "").trim())
      .filter(Boolean)
      .slice(0, 5);
    const objects = (objRes.localizedObjectAnnotations || [])
      .map((o) => String(o.name || "").trim())
      .filter(Boolean)
      .slice(0, 3);
    const firstTextLine = String(textRes.fullTextAnnotation?.text || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)[0] || "";
    const logos = (logoRes.logoAnnotations || [])
      .map((l) => String(l.description || "").trim())
      .filter(Boolean)
      .slice(0, 2);
    const webEntities = (webRes.webDetection?.webEntities || [])
      .filter((e) => Number(e.score || 0) >= 0.7)
      .map((e) => String(e.description || "").trim())
      .filter(Boolean)
      .slice(0, 4);

    const signalText = [firstTextLine, ...labels, ...objects, ...logos, ...webEntities].join(" ");
    const vehicleQuery = extractVehicleDescriptor(signalText);
    const luxuryBrandQuery = extractLuxuryBrandDescriptor(signalText);
    const merged = unique([...logos, ...webEntities, ...labels, ...objects]).slice(0, 6);
    let query = vehicleQuery || luxuryBrandQuery || merged.join(" ").trim();
    let aiFallbackUsed = false;
    const detectionConfidence = vehicleQuery
      ? "high"
      : luxuryBrandQuery
        ? "high"
        : logos.length
        ? "medium"
        : webEntities.length >= 2
          ? "medium"
          : labels.length >= 2
            ? "low"
            : "low";

    const barcodeEnrichment = await enrichQueryFromBarcodeSignals({
      manualItemQuery: "",
      baseQuery: signalText,
      conditionNotes: "",
      labels: merged,
    });
    if (barcodeEnrichment?.query && (!query || detectionConfidence === "low")) {
      query = barcodeEnrichment.query;
    }

    // AI fallback for non-vehicle items when Vision signals are weak.
    const canUseOpenAiFallback =
      Boolean(OPENAI_API_KEY) &&
      !vehicleQuery &&
      (!query || detectionConfidence === "low") &&
      !Boolean(opts.fast);
    if (canUseOpenAiFallback) {
      const aiDetected = await detectItemWithOpenAiFromImageBuffer(buffer);
      if (aiDetected?.ok && aiDetected.query) {
        query = aiDetected.query;
        aiFallbackUsed = true;
      }
    }

    const categoryHint = barcodeEnrichment?.categoryHint || detectCategory(query, merged);

    return {
      ok: Boolean(query),
      query,
      category: categoryHint || "general",
      labels: merged,
      firstTextLine,
      logos,
      webEntities,
      detectionConfidence,
      aiFallbackUsed,
      error: query ? null : "No reliable object detected from image.",
    };
  } catch (err) {
    if (OPENAI_API_KEY) {
      const aiDetected = await detectItemWithOpenAiFromImageBuffer(buffer);
      if (aiDetected?.ok && aiDetected.query) {
        return {
          ok: true,
          query: aiDetected.query,
          category: aiDetected.category || "general",
          labels: [],
          firstTextLine: aiDetected.query,
          logos: [],
          webEntities: [],
          detectionConfidence: "medium",
          aiFallbackUsed: true,
          error: null,
        };
      }
    }
    return { ok: false, error: `Image detection failed: ${String(err?.message || err)}` };
  }
}

async function detectItemWithOpenAiFromImageBuffer(buffer) {
  if (!OPENAI_API_KEY || !buffer) return { ok: false, error: "openai_unavailable" };
  const mime = "image/jpeg";
  const b64 = buffer.toString("base64");
  const imageUrl = `data:${mime};base64,${b64}`;

  const prompt = [
    "Identify the primary resale item in this photo.",
    "Return strict JSON only with keys: query, category.",
    'category must be one of: vehicle,electronics,fashion,home,collectible,tools,general.',
    'query must be short and specific, e.g. "iPhone 14 Pro 256GB", "Makita drill driver", "Nike Air Max 90".',
  ].join(" ");

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: String(j?.error?.message || `openai_http_${r.status}`) };
    const raw = String(j?.choices?.[0]?.message?.content || "").trim();
    const parsed = raw ? JSON.parse(raw) : {};
    const query = String(parsed?.query || "").trim();
    const category = String(parsed?.category || "").trim().toLowerCase();
    return {
      ok: Boolean(query),
      query,
      category: category || "general",
    };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

function conditionTierFactor(conditionTier) {
  const tier = String(conditionTier || "good").toLowerCase();
  if (tier === "mint") return { factor: 1.12, label: "mint condition premium" };
  if (tier === "fair") return { factor: 0.82, label: "fair condition discount" };
  if (tier === "broken") return { factor: 0.55, label: "broken condition discount" };
  return { factor: 1, label: "good condition baseline" };
}

function recommendMarketplaces({ category, region, confidenceLabel, condition }) {
  const local = region === "uk" ? "Facebook Marketplace / Gumtree" : "Facebook Marketplace / Craigslist";
  const recs = [];

  if (category === "vehicle") {
    recs.push(
      { name: "Facebook Marketplace", reason: "Fast local buyer demand for used vehicles.", speed: "fast", fee: "low" },
      { name: "AutoTrader", reason: "Higher intent vehicle shoppers, usually better pricing.", speed: "medium", fee: "medium" },
      { name: "eBay Motors", reason: "Wider audience when local demand is weak.", speed: "medium", fee: "medium" }
    );
  } else if (category === "electronics") {
    recs.push(
      { name: "eBay", reason: "Large buyer pool and strong sold-price data.", speed: "medium", fee: "medium" },
      { name: "Facebook Marketplace", reason: "No shipping and quick local sales.", speed: "fast", fee: "low" },
      { name: "Swappa", reason: "Good for phones/laptops with cleaner listings.", speed: "medium", fee: "low" }
    );
  } else if (category === "fashion") {
    recs.push(
      { name: "eBay", reason: "Reliable for pre-owned fashion/liquidity.", speed: "medium", fee: "medium" },
      { name: "GOAT/StockX", reason: "Best for hype sneakers with verified demand.", speed: "medium", fee: "high" },
      { name: "Vinted/Depop", reason: "Easy listing flow for everyday clothing.", speed: "fast", fee: "low" }
    );
  } else if (category === "collectible") {
    recs.push(
      { name: "eBay", reason: "Auction + sold history helps price discovery.", speed: "medium", fee: "medium" },
      { name: "Specialist forums/groups", reason: "Higher trust for niche collectibles.", speed: "slow", fee: "low" },
      { name: "Facebook Marketplace", reason: "Quick local cash-outs for lower value items.", speed: "fast", fee: "low" }
    );
  } else {
    recs.push(
      { name: "Facebook Marketplace", reason: "Fastest no-ship local resale route.", speed: "fast", fee: "low" },
      { name: "eBay", reason: "Best broad reach if local demand is weak.", speed: "medium", fee: "medium" },
      { name: local, reason: "Useful local fallback channel.", speed: "fast", fee: "low" }
    );
  }

  if (confidenceLabel === "low") {
    recs.unshift({
      name: "List locally first",
      reason: "Price confidence is low; test demand quickly before committing to fees.",
      speed: "fast",
      fee: "low",
    });
  }

  if (condition === "new") {
    recs.unshift({
      name: "eBay Buy It Now",
      reason: "New-condition items usually get stronger national pricing.",
      speed: "medium",
      fee: "medium",
    });
  }

  return recs.slice(0, 4);
}

function estimateSellTime({ category, confidenceLabel, condition, conditionTier }) {
  const baseDaysByCategory = {
    vehicle: 24,
    electronics: 10,
    fashion: 14,
    home: 18,
    collectible: 20,
    tools: 12,
    general: 16,
  };
  let days = baseDaysByCategory[category] || baseDaysByCategory.general;
  if (confidenceLabel === "high") days -= 4;
  if (confidenceLabel === "low") days += 6;
  if (condition === "new") days -= 2;
  if (condition === "used") days += 1;
  if (conditionTier === "broken") days += 10;
  if (conditionTier === "mint") days -= 2;
  days = Math.max(2, days);

  const minDays = Math.max(1, Math.round(days * 0.6));
  const maxDays = Math.max(minDays + 1, Math.round(days * 1.4));
  const speed = maxDays <= 10 ? "fast" : maxDays <= 21 ? "medium" : "slow";
  return { speed, minDays, maxDays, text: `${minDays}-${maxDays} days` };
}

function buildProfitSummary({ buyPrice, low, median, high }) {
  const buy = Number(buyPrice);
  if (!Number.isFinite(buy) || buy <= 0) return null;
  const safeLow = Number.isFinite(low) ? low : null;
  const safeMed = Number.isFinite(median) ? median : null;
  const safeHigh = Number.isFinite(high) ? high : null;

  const expectedProfit = Number.isFinite(safeMed) ? safeMed - buy : null;
  const conservativeProfit = Number.isFinite(safeLow) ? safeLow - buy : null;
  const optimisticProfit = Number.isFinite(safeHigh) ? safeHigh - buy : null;
  const expectedMarginPct =
    Number.isFinite(expectedProfit) && buy > 0 ? (expectedProfit / buy) * 100 : null;

  return {
    buyPrice: buy,
    expectedProfit,
    conservativeProfit,
    optimisticProfit,
    expectedMarginPct,
  };
}

function buildListingAssistant({ query, category, condition, conditionTier, conditionNotes, median, low, high, currencySymbol, confidence }) {
  if (!Number.isFinite(median)) return null;
  const priceNow = Math.round(median);
  const lowAsk = Number.isFinite(low) ? Math.round(low) : Math.round(median * 0.9);
  const highAsk = Number.isFinite(high) ? Math.round(high) : Math.round(median * 1.1);
  const tags = [
    `${condition} ${conditionTier} condition`,
    confidence === "high" ? "priced to market" : "open to offers",
  ];
  if (conditionNotes) tags.push(conditionNotes);

  return {
    suggestedTitle: `${query} - ${condition} - ${category}`,
    suggestedStartPrice: `${currencySymbol}${priceNow}`,
    suggestedRange: `${currencySymbol}${lowAsk} - ${currencySymbol}${highAsk}`,
    bulletPoints: tags.slice(0, 4),
    listingTip:
      confidence === "low"
        ? "Use local listings first and adjust after first 24h response."
        : "Start at suggested price, then reduce 3-5% if no messages in 48h.",
  };
}

function estimateRecommendedRetailPrice({
  category,
  query,
  resaleMedian,
  resaleLow,
  resaleHigh,
  conditionTier,
  condition,
  vehicleYear,
  currencySymbol,
}) {
  if (!Number.isFinite(resaleMedian) || resaleMedian <= 0) return null;

  const retentionByCategory = {
    vehicle: 0.28,
    electronics: 0.38,
    fashion: 0.36,
    home: 0.42,
    collectible: 0.62,
    tools: 0.5,
    general: 0.4,
  };
  let retention = retentionByCategory[category] || retentionByCategory.general;
  const q = normalizeText(query);

  // Premium electronics often retain a lower share of original retail.
  if (category === "electronics") {
    if (/\b(macbook|mac book|imac|mac mini|surface book|xps)\b/.test(q)) retention = 0.3;
    else if (/\b(iphone)\b/.test(q)) retention = 0.42;
    else if (/\b(ipad)\b/.test(q)) retention = 0.46;
    else if (/\b(playstation|ps5|xbox|switch)\b/.test(q)) retention = 0.55;
  }

  if (category === "vehicle" && Number.isFinite(vehicleYear)) {
    const currentYear = new Date().getFullYear();
    const age = Math.max(0, currentYear - Number(vehicleYear));
    if (age >= 18) retention = 0.2;
    else if (age >= 12) retention = 0.24;
    else if (age >= 8) retention = 0.3;
    else if (age >= 4) retention = 0.38;
  }

  if (condition === "new") retention = Math.min(0.85, retention * 1.15);
  if (conditionTier === "mint") retention = Math.min(0.9, retention * 1.1);
  if (conditionTier === "fair") retention *= 0.82;
  if (conditionTier === "broken") retention *= 0.6;

  retention = Math.max(0.08, Math.min(0.9, retention));

  const median = resaleMedian / retention;
  const lowFromResale = Number.isFinite(resaleLow) ? resaleLow / retention : median * 0.85;
  const highFromResale = Number.isFinite(resaleHigh) ? resaleHigh / retention : median * 1.15;
  const low = Math.min(lowFromResale, median * 0.92);
  const high = Math.max(highFromResale, median * 1.08);

  return {
    low,
    median,
    high,
    retentionRate: retention,
    label: "Estimated retail when new",
    note: `Based on current resale value and depreciation model (${currencySymbol} market).`,
  };
}

function median(nums) {
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function weightedMedian(values, weights) {
  const items = values
    .map((v, i) => ({ v, w: Number(weights[i]) || 1 }))
    .filter((x) => Number.isFinite(x.v) && Number.isFinite(x.w) && x.w > 0)
    .sort((a, b) => a.v - b.v);
  if (!items.length) return null;
  const total = items.reduce((s, x) => s + x.w, 0);
  let running = 0;
  for (const item of items) {
    running += item.w;
    if (running >= total / 2) return item.v;
  }
  return items[items.length - 1].v;
}

function unique(arr) {
  return [...new Set(arr)];
}

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

function filterOutliersIQR(nums) {
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (a.length < 5) return a;
  const q1 = quantile(a, 0.25);
  const q3 = quantile(a, 0.75);
  if (!Number.isFinite(q1) || !Number.isFinite(q3)) return a;
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  return a.filter((n) => n >= lo && n <= hi);
}

function bandFilterByCategory(comps, category) {
  if (!Array.isArray(comps) || !comps.length) return comps;
  const nums = comps.map((c) => c.n).filter((n) => Number.isFinite(n));
  const med = median(nums);
  if (!Number.isFinite(med) || med <= 0) return comps;

  let lowFactor = 0.5;
  let highFactor = 2.0;
  if (category === "vehicle") {
    lowFactor = 0.6;
    highFactor = 1.9;
  } else if (category === "electronics") {
    lowFactor = 0.55;
    highFactor = 1.85;
  } else if (category === "fashion") {
    lowFactor = 0.45;
    highFactor = 2.2;
  } else if (category === "tools" || category === "home") {
    lowFactor = 0.5;
    highFactor = 2.1;
  }

  const lo = med * lowFactor;
  const hi = med * highFactor;
  const filtered = comps.filter((c) => Number.isFinite(c.n) && c.n >= lo && c.n <= hi);
  return filtered.length >= 2 ? filtered : comps;
}

function clipCompsByRobustStats(comps, category) {
  if (!Array.isArray(comps) || comps.length < 6) return comps;
  const numericComps = comps.filter((c) => Number.isFinite(c.n));
  if (numericComps.length < 6) return comps;
  const nums = numericComps.map((c) => c.n);
  const med = median(nums);
  if (!Number.isFinite(med) || med <= 0) return comps;
  const deviations = nums.map((n) => Math.abs(n - med));
  const mad = median(deviations);
  if (!Number.isFinite(mad) || mad <= 0) return comps;

  const sigma = 1.4826 * mad;
  const sigmaMult = category === "vehicle" ? 2.8 : 3.2;
  const lo = med - sigmaMult * sigma;
  const hi = med + sigmaMult * sigma;
  let filtered = numericComps.filter((c) => c.n >= lo && c.n <= hi);

  if (category === "vehicle" && filtered.length >= 8) {
    const sorted = filtered.slice().sort((a, b) => a.n - b.n);
    const trim = Math.max(0, Math.floor(sorted.length * 0.05));
    if (trim > 0 && sorted.length - trim * 2 >= 6) {
      filtered = sorted.slice(trim, sorted.length - trim);
    }
  }

  return filtered.length >= Math.max(3, Math.floor(numericComps.length * 0.55)) ? filtered : numericComps;
}

function confidenceFromStats(priceCount, sourceCount, filteredCount) {
  let score = 30;
  score += Math.min(priceCount, 12) * 4;
  score += Math.min(sourceCount, 6) * 4;
  if (priceCount > filteredCount) score -= Math.min(priceCount - filteredCount, 4) * 5;
  score = Math.max(0, Math.min(100, score));
  const label = score >= 75 ? "high" : score >= 50 ? "medium" : "low";
  return { score, label };
}

function confidenceLabelFromScore(score) {
  if (score >= 75) return "high";
  if (score >= 50) return "medium";
  return "low";
}

function sourceConsensusStats(filteredComps) {
  const groups = new Map();
  for (const comp of filteredComps || []) {
    const n = Number(comp?.n);
    if (!Number.isFinite(n) || n <= 0) continue;
    const source = String(comp?.source || "unknown").trim().toLowerCase() || "unknown";
    if (!groups.has(source)) groups.set(source, []);
    groups.get(source).push(n);
  }
  const medians = [];
  for (const values of groups.values()) {
    const m = median(values);
    if (Number.isFinite(m) && m > 0) medians.push(m);
  }
  if (medians.length < 2) {
    return {
      sourceMedians: medians,
      consensusSpreadPct: 0,
      lowConsensus: false,
    };
  }
  const lo = Math.min(...medians);
  const hi = Math.max(...medians);
  const med = median(medians);
  const spread = Number.isFinite(med) && med > 0 ? (hi - lo) / med : 0;
  return {
    sourceMedians: medians,
    consensusSpreadPct: spread,
    lowConsensus: spread > 0.45,
  };
}

function buildConfidenceReasons({ confidence, rawCount, filteredCount, sourceCount, category, matchedComps }) {
  const reasons = [];
  if (rawCount < 3) reasons.push("few priced listings found");
  if (filteredCount < Math.max(2, Math.ceil(rawCount * 0.5))) reasons.push("many outliers/noisy prices removed");
  if (sourceCount <= 1) reasons.push("single-source market data");
  if (category === "vehicle" && filteredCount < 4) reasons.push("limited exact vehicle matches");
  if (matchedComps && matchedComps.some((c) => c.matchScore < 65)) reasons.push("some comps are weak title matches");
  if (!reasons.length && confidence.label === "high") reasons.push("strong comp count across multiple sources");
  if (!reasons.length && confidence.label === "medium") reasons.push("reasonable comp coverage with minor variance");
  if (!reasons.length) reasons.push("limited reliable data for this item");
  return reasons.slice(0, 4);
}

function mean(nums) {
  const a = nums.filter((n) => Number.isFinite(n));
  if (!a.length) return null;
  return a.reduce((s, n) => s + n, 0) / a.length;
}

function qualityGate({ category, filteredComps, filteredNums, sourceCount, confidence }) {
  const compCount = filteredComps.length;
  const avgMatch = mean(filteredComps.map((c) => c.matchScore)) || 0;
  const med = median(filteredNums);
  const lo = filteredNums.length ? Math.min(...filteredNums) : null;
  const hi = filteredNums.length ? Math.max(...filteredNums) : null;
  const spreadPct =
    Number.isFinite(med) && Number.isFinite(lo) && Number.isFinite(hi) && med > 0
      ? (hi - lo) / med
      : 0.8;

  let score = 100;
  if (compCount < 3) score -= 35;
  if (compCount < 5) score -= 15;
  if (sourceCount < 2) score -= 20;
  if (avgMatch < 70) score -= 20;
  if (spreadPct > 0.65) score -= 20;
  if (spreadPct > 1.0) score -= 15;
  if (category === "vehicle" && compCount < 4) score -= 15;
  if (confidence.label === "low") score -= 10;

  score = Math.max(0, Math.min(100, score));
  const status = score >= 70 ? "pass" : score >= 50 ? "caution" : "hold";

  const reasons = [];
  if (compCount < 3) reasons.push("too few close matches");
  if (sourceCount < 2) reasons.push("not enough independent sources");
  if (avgMatch < 70) reasons.push("weak title/model match quality");
  if (spreadPct > 0.65) reasons.push("high market price variance");
  if (!reasons.length) reasons.push("pricing quality looks stable");

  return {
    status,
    score,
    metrics: {
      compCount,
      sourceCount,
      avgMatchScore: avgMatch,
      spreadPct,
    },
    reasons,
  };
}

function shouldWithholdValuation({ gate, confidence, soldCompsBenchmark, category }) {
  const confidenceScore = Number(confidence?.score || 0);
  const confidenceLabel = String(confidence?.label || "low");
  const gateStatus = String(gate?.status || "hold");
  const soldCount = Number(soldCompsBenchmark?.count || 0);
  const soldSource = String(soldCompsBenchmark?.source || "").toLowerCase();
  const soldMedian = Number(soldCompsBenchmark?.median || 0);
  const soldLow = Number(soldCompsBenchmark?.low || 0);
  const soldHigh = Number(soldCompsBenchmark?.high || 0);
  const soldSpreadPct =
    Number.isFinite(soldMedian) && soldMedian > 0 && Number.isFinite(soldLow) && Number.isFinite(soldHigh)
      ? Math.max(0, (soldHigh - soldLow) / soldMedian)
      : 999;

  const hasStrongSoldSupport =
    (soldSource === "manual" && soldCount >= 2) ||
    (category === "vehicle" && soldSource === "soldcartracker" && soldCount >= 8) ||
    soldCount >= 18;

  if (category === "vehicle") {
    if (gateStatus !== "pass" && confidenceScore < 72) {
      return { withhold: true, reason: "vehicle valuation needs stronger match quality" };
    }
    if (soldCount > 0 && soldCount < 4 && confidenceScore < 80) {
      return { withhold: true, reason: "insufficient sold evidence for vehicle pricing" };
    }
  }

  if (category !== "vehicle") {
    if (soldSource === "manual" && soldCount >= 2 && soldSpreadPct <= 0.6 && confidenceScore >= 38) {
      return { withhold: false, reason: null };
    }
    if (soldSource === "manual" && soldCount >= 1 && confidenceScore >= 45) {
      return { withhold: false, reason: null };
    }
    if (soldCount >= 3 && soldSpreadPct <= 0.65 && confidenceScore >= 50) {
      return { withhold: false, reason: null };
    }
  }

  if (hasStrongSoldSupport) return { withhold: false, reason: null };
  if (gateStatus === "hold") return { withhold: true, reason: "quality gate hold" };
  if (confidenceLabel === "low" && confidenceScore < 45) {
    return { withhold: true, reason: "low confidence and weak sold support" };
  }
  return { withhold: false, reason: null };
}

function applyAccuracyHold(pricing, reason, category) {
  const next = { ...(pricing || {}) };
  next.finalStatus = "needs_details";
  next.low = null;
  next.median = null;
  next.high = null;
  next.provisional = true;
  next.provisionalReason = reason || "accuracy hold";
  const reasons = Array.isArray(next.confidenceReasons) ? next.confidenceReasons.slice(0, 6) : [];
  reasons.push(`accuracy hold: ${reason || "insufficient evidence"}`);
  next.confidenceReasons = unique(reasons);
  next.accuracyNextSteps =
    category === "vehicle"
      ? [
          "Retake clear photo with full number plate visible",
          "Confirm registration manually",
          "Add mileage and condition details",
          "Run refine scan for stronger comps",
        ]
      : [
          "Retake photo with one item filling frame",
          "Add brand, model, and condition notes",
          "Run refine scan for stronger comps",
        ];
  next.accuracy = {
    ready: false,
    score: Math.min(Number(next?.accuracy?.score || 0), 49),
    blockers: unique([...(next?.accuracy?.blockers || []), reason || "insufficient evidence"]),
  };
  return next;
}

function guessCurrencyFromPrices(prices, fallback = "USD") {
  // crude: look for £ $ €
  const joined = prices.join(" ");
  if (joined.includes("£")) return "GBP";
  if (joined.includes("€")) return "EUR";
  if (joined.includes("$")) return "USD";
  return fallback;
}

async function serpApiShoppingSearch(query, market, timeoutMs = SERPAPI_TIMEOUT_MS) {
  if (!SERPAPI_KEY) {
    return { ok: false, error: "SERPAPI_KEY missing in backend/.env" };
  }

  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_shopping");
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", SERPAPI_KEY);
  url.searchParams.set("gl", market.gl);
  url.searchParams.set("hl", market.hl);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let text = "";
  try {
    const resp = await fetch(url.toString(), { signal: controller.signal });
    text = await resp.text();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err && err.name === "AbortError") {
      return { ok: false, error: `Pricing lookup timed out after ${SERPAPI_TIMEOUT_MS / 1000}s` };
    }
    return { ok: false, error: "Pricing lookup failed. Please try again." };
  } finally {
    clearTimeout(timeoutId);
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "SerpAPI returned non-JSON response." };
  }

  if (json.error) return { ok: false, error: String(json.error) };

  const results = Array.isArray(json.shopping_results) ? json.shopping_results : [];
  return { ok: true, results };
}

async function serpApiWebSearch(query, market, timeoutMs = SERPAPI_TIMEOUT_MS) {
  if (!SERPAPI_KEY) {
    return { ok: false, error: "SERPAPI_KEY missing in backend/.env" };
  }

  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", SERPAPI_KEY);
  url.searchParams.set("gl", market.gl);
  url.searchParams.set("hl", market.hl);
  url.searchParams.set("num", "20");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let text = "";
  try {
    const resp = await fetch(url.toString(), { signal: controller.signal });
    text = await resp.text();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err && err.name === "AbortError") {
      return { ok: false, error: `Web lookup timed out after ${SERPAPI_TIMEOUT_MS / 1000}s` };
    }
    return { ok: false, error: "Web lookup failed. Please try again." };
  } finally {
    clearTimeout(timeoutId);
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "SerpAPI web search returned non-JSON response." };
  }

  if (json.error) return { ok: false, error: String(json.error) };
  const results = Array.isArray(json.organic_results) ? json.organic_results : [];
  return { ok: true, results };
}

async function fetchUkVehicleStatusFromDvla(registrationNumber) {
  const reg = String(registrationNumber || "").toUpperCase().replace(/\s+/g, "");
  if (!reg) {
    return { ok: false, error: "Registration number is required." };
  }
  if (!DVLA_VEHICLE_API_KEY) {
    return {
      ok: false,
      error: "DVLA_VEHICLE_API_KEY is missing on backend. Add it to backend/.env.",
      code: "missing_dvla_key",
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const resp = await fetch(DVLA_VEHICLE_ENQUIRY_URL, {
      method: "POST",
      headers: {
        "x-api-key": DVLA_VEHICLE_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ registrationNumber: reg }),
      signal: controller.signal,
    });
    const text = await resp.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {}
    if (!resp.ok) {
      if (resp.status === 401 || resp.status === 403) {
        return {
          ok: false,
          code: "dvla_auth_failed",
          error:
            "DVLA API key was rejected (403 Forbidden). In DVLA developer portal, enable Vehicle Enquiry API and replace DVLA_VEHICLE_API_KEY in backend/.env, then restart backend.",
        };
      }
      if (resp.status === 429) {
        return {
          ok: false,
          code: "dvla_rate_limited",
          error: "DVLA API rate limit hit. Please wait and retry.",
        };
      }
      return {
        ok: false,
        code: "dvla_http_error",
        error: String(json?.message || json?.errors?.[0]?.detail || `DVLA API error (${resp.status})`),
      };
    }
    return {
      ok: true,
      registrationNumber: reg,
      make: json?.make || null,
      colour: json?.colour || null,
      fuelType: json?.fuelType || null,
      yearOfManufacture: json?.yearOfManufacture || null,
      motStatus: json?.motStatus || null,
      motExpiryDate: json?.motExpiryDate || null,
      taxStatus: json?.taxStatus || null,
      taxDueDate: json?.taxDueDate || null,
      source: "DVLA Vehicle Enquiry API",
      checkedAt: new Date().toISOString(),
    };
  } catch (err) {
    if (err && err.name === "AbortError") {
      return { ok: false, error: "DVLA check timed out. Please try again." };
    }
    return { ok: false, error: `DVLA check failed: ${String(err?.message || err)}` };
  } finally {
    clearTimeout(timeoutId);
  }
}

function mapCheckCarResponseToVehicleStatus(reg, payload) {
  const src = payload || {};
  const tax = src.tax || src.Tax || {};
  const mot = src.mot || src.Mot || {};
  const motHistoryRaw = src.motHistory || src.MotHistory || [];
  const motHistory = Array.isArray(motHistoryRaw)
    ? motHistoryRaw
        .map((row) => {
          const miles = Number(row?.odometerMiles || row?.mileage || row?.odometerValue || 0) || null;
          return {
            testDate: row?.testDate || row?.completedDate || null,
            result: row?.result || row?.testResult || null,
            expiryDate: row?.expiryDate || row?.motDueDate || null,
            odometerMiles: miles,
          };
        })
        .filter((row) => row.testDate || row.odometerMiles)
    : [];
  const vehicleRegistration = src.VehicleRegistration || src.vehicleRegistration || {};
  const history = src.VehicleHistory || src.vehicleHistory || {};
  const valuationSummary = parseCheckCarValuationSummary(src) || null;
  const writeOffList = Array.isArray(history.writeoff) ? history.writeoff : [];
  const financeList = Array.isArray(history.finance) ? history.finance : [];
  const stolenList = Array.isArray(history.stolen) ? history.stolen : [];
  const hasWriteOffRecord =
    Boolean(history.writeOffRecord) ||
    Boolean(history.writeOff) ||
    writeOffList.length > 0;
  const hasFinanceRecord =
    Boolean(history.financeRecord) ||
    financeList.length > 0;
  const hasStolenRecord =
    Boolean(history.stolenRecord) ||
    stolenList.length > 0;
  const latestWriteOffStatus = writeOffList[0]?.status || null;

  return {
    ok: true,
    registrationNumber: reg,
    make: src.make || src.Make || null,
    model: src.model || src.Model || vehicleRegistration.Model || null,
    colour: src.colour || src.Colour || null,
    fuelType: src.fuelType || src.FuelType || null,
    yearOfManufacture: src.yearOfManufacture || src.YearOfManufacture || null,
    motStatus: mot.motStatus || mot.MotStatus || src.motStatus || src.MotStatus || null,
    motExpiryDate: mot.motDueDate || mot.MotDueDate || src.motExpiryDate || src.motDueDate || null,
    taxStatus: tax.taxStatus || tax.TaxStatus || src.taxStatus || src.TaxStatus || null,
    taxDueDate: tax.taxDueDate || tax.TaxDueDate || src.taxDueDate || src.TaxDueDate || null,
    crashHistory: {
      hasWriteOffRecord,
      writeOffCount: writeOffList.length,
      latestWriteOffStatus,
      source: "CheckCarDetails VehicleHistory",
    },
    historyCategories: {
      hasFinanceRecord,
      financeCount: financeList.length,
      hasStolenRecord,
      stolenCount: stolenList.length,
      hasWriteOffRecord,
      writeOffCount: writeOffList.length,
    },
    motHistory,
    mileage: {
      valueMiles: Number(src?.mileage?.valueMiles || src?.Mileage || 0) || null,
      source: src?.mileage?.source || null,
    },
    valuation: valuationSummary,
    source: "CheckCarDetails API",
    checkedAt: new Date().toISOString(),
  };
}

async function fetchUkVehicleStatusFromCheckCar(
  registrationNumber,
  {
    allowStaleCache = true,
    includeUkVehicleData = false,
    includeCarHistory = false,
  } = {}
) {
  const reg = String(registrationNumber || "").toUpperCase().replace(/\s+/g, "");
  if (!reg) return { ok: false, error: "Registration number is required." };
  const budgetWarnings = [];

  const freshCache = getCachedUkStatus(reg, { allowStale: false });
  const bypassFreshCache = Boolean(includeUkVehicleData || includeCarHistory);
  if (freshCache?.status && !bypassFreshCache) {
    return {
      ...freshCache.status,
      fromCache: true,
      stale: false,
      cacheAgeSec: Math.round(Number(freshCache.ageMs || 0) / 1000),
      cacheSavedAt: freshCache.savedAt || null,
    };
  }

  if (!CHECKCAR_API_KEY) {
    const staleSetupCache = allowStaleCache ? getCachedUkStatus(reg, { allowStale: true }) : null;
    if (staleSetupCache?.status) {
      return {
        ...staleSetupCache.status,
        fromCache: true,
        stale: true,
        cacheAgeSec: Math.round(Number(staleSetupCache.ageMs || 0) / 1000),
        cacheSavedAt: staleSetupCache.savedAt || null,
        warning: "status setup missing; using cached vehicle status",
      };
    }
    return { ok: false, code: "missing_checkcar_key", error: "CHECKCAR_API_KEY is missing on backend." };
  }
  if (!CHECKCAR_URL_TEMPLATE) {
    const staleSetupCache = allowStaleCache ? getCachedUkStatus(reg, { allowStale: true }) : null;
    if (staleSetupCache?.status) {
      return {
        ...staleSetupCache.status,
        fromCache: true,
        stale: true,
        cacheAgeSec: Math.round(Number(staleSetupCache.ageMs || 0) / 1000),
        cacheSavedAt: staleSetupCache.savedAt || null,
        warning: "status template missing; using cached vehicle status",
      };
    }
    return {
      ok: false,
      code: "missing_checkcar_template",
      error: "CHECKCAR_URL_TEMPLATE is missing. Add your exact endpoint URL template from checkcardetails docs (use {vrm} and {key} placeholders).",
    };
  }

  const url = CHECKCAR_URL_TEMPLATE
    .replaceAll("{vrm}", encodeURIComponent(reg))
    .replaceAll("{key}", encodeURIComponent(CHECKCAR_API_KEY));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CHECKCAR_STATUS_TIMEOUT_MS);
  try {
    const primaryBudget = checkcarBudgetDecision({ costTier: "primary" });
    if (!primaryBudget.allow) {
      const staleBudgetCache = allowStaleCache ? getCachedUkStatus(reg, { allowStale: true }) : null;
      if (staleBudgetCache?.status) {
        return {
          ...staleBudgetCache.status,
          fromCache: true,
          stale: true,
          cacheAgeSec: Math.round(Number(staleBudgetCache.ageMs || 0) / 1000),
          cacheSavedAt: staleBudgetCache.savedAt || null,
          warning: primaryBudget.message,
        };
      }
      return {
        ok: false,
        code: primaryBudget.code || "checkcar_budget_limited",
        error: primaryBudget.message || "Status lookup blocked by daily provider budget limits.",
        usage: primaryBudget.usage,
      };
    }
    incrementCheckcarUsage("vehiclereg", 1);
    const resp = await fetch(url, { method: "GET", signal: controller.signal });
    const text = await resp.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}

    if (!resp.ok) {
      if (resp.status === 404) {
        return {
          ok: false,
          code: "checkcar_not_found",
          error: "Registration not found in provider dataset.",
        };
      }
      const staleHttpCache = allowStaleCache ? getCachedUkStatus(reg, { allowStale: true }) : null;
      if (staleHttpCache?.status) {
        return {
          ...staleHttpCache.status,
          fromCache: true,
          stale: true,
          cacheAgeSec: Math.round(Number(staleHttpCache.ageMs || 0) / 1000),
          cacheSavedAt: staleHttpCache.savedAt || null,
          warning: `status endpoint http ${resp.status}`,
        };
      }
      return {
        ok: false,
        code: "checkcar_http_error",
        error: `CheckCarDetails API error (${resp.status}). Verify CHECKCAR_URL_TEMPLATE and key.`,
        details: String(text || "").slice(0, 180),
      };
    }

    let payload = json?.data || json?.result || json?.VehicleRegistration || json;
    // If the chosen datapoint is minimal, enrich with ukvehicledata details.
    const hasVehicleHistory = Boolean(payload?.VehicleHistory || payload?.vehicleHistory);
    if (!hasVehicleHistory && includeUkVehicleData && CHECKCAR_UKVEHICLEDATA_URL_TEMPLATE) {
      const enrichBudget = checkcarBudgetDecision({ costTier: "enrichment" });
      if (enrichBudget.allow) {
        try {
          incrementCheckcarUsage("ukvehicledata", 1);
          const ukDataUrl = CHECKCAR_UKVEHICLEDATA_URL_TEMPLATE
            .replaceAll("{vrm}", encodeURIComponent(reg))
            .replaceAll("{key}", encodeURIComponent(CHECKCAR_API_KEY));
          const ukDataResp = await fetch(ukDataUrl, { method: "GET", signal: controller.signal });
          const ukDataText = await ukDataResp.text();
          let ukDataJson = null;
          try { ukDataJson = ukDataText ? JSON.parse(ukDataText) : null; } catch {}
          if (ukDataResp.ok && ukDataJson && typeof ukDataJson === "object") {
            payload = { ...(payload || {}), ...ukDataJson };
          }
        } catch {}
      } else {
        budgetWarnings.push(enrichBudget.message || "ukvehicledata enrichment skipped due to budget limit");
      }
    }
    // Always attempt carhistorycheck enrichment because write-off (Cat N/S) lives there for many records.
    if (includeCarHistory && CHECKCAR_CARHISTORY_URL_TEMPLATE) {
      const historyBudget = checkcarBudgetDecision({ costTier: "enrichment" });
      if (historyBudget.allow) {
        try {
          incrementCheckcarUsage("carhistory", 1);
          const historyUrl = CHECKCAR_CARHISTORY_URL_TEMPLATE
            .replaceAll("{vrm}", encodeURIComponent(reg))
            .replaceAll("{key}", encodeURIComponent(CHECKCAR_API_KEY));
          const historyResp = await fetch(historyUrl, { method: "GET", signal: controller.signal });
          const historyText = await historyResp.text();
          let historyJson = null;
          try { historyJson = historyText ? JSON.parse(historyText) : null; } catch {}
          if (historyResp.ok && historyJson && typeof historyJson === "object") {
            payload = { ...(payload || {}), ...historyJson };
          }
        } catch {}
      } else {
        budgetWarnings.push(historyBudget.message || "carhistory enrichment skipped due to budget limit");
      }
    }
    if (!payload || typeof payload !== "object") {
      const stalePayloadCache = allowStaleCache ? getCachedUkStatus(reg, { allowStale: true }) : null;
      if (stalePayloadCache?.status) {
        return {
          ...stalePayloadCache.status,
          fromCache: true,
          stale: true,
          cacheAgeSec: Math.round(Number(stalePayloadCache.ageMs || 0) / 1000),
          cacheSavedAt: stalePayloadCache.savedAt || null,
          warning: "status payload invalid; using cached vehicle status",
        };
      }
      return { ok: false, code: "checkcar_bad_payload", error: "CheckCarDetails returned unexpected payload shape." };
    }
    const status = mapCheckCarResponseToVehicleStatus(reg, payload);
    if (status?.ok) {
      const usage = getCheckcarUsageSnapshot();
      status.providerUsage = {
        provider: "checkcardetails",
        date: usage.date,
        totalToday: usage.total,
        softLimit: usage.limits.soft,
        hardLimit: usage.limits.hard,
      };
      if (budgetWarnings.length) {
        status.providerUsage.warnings = budgetWarnings.slice(0, 3);
      }
    }
    if (status?.ok) setCachedUkStatus(reg, status);
    return status;
  } catch (err) {
    const staleErrorCache = allowStaleCache ? getCachedUkStatus(reg, { allowStale: true }) : null;
    if (staleErrorCache?.status) {
      return {
        ...staleErrorCache.status,
        fromCache: true,
        stale: true,
        cacheAgeSec: Math.round(Number(staleErrorCache.ageMs || 0) / 1000),
        cacheSavedAt: staleErrorCache.savedAt || null,
        warning: err?.name === "AbortError" ? "status endpoint timeout; using cached vehicle status" : String(err?.message || err),
      };
    }
    if (err && err.name === "AbortError") {
      return { ok: false, code: "checkcar_timeout", error: "CheckCarDetails request timed out." };
    }
    return { ok: false, code: "checkcar_fetch_failed", error: `CheckCarDetails failed: ${String(err?.message || err)}` };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchUkVehicleStatus(registrationNumber, options = {}) {
  if (VEHICLE_STATUS_PROVIDER === "checkcardetails") {
    return fetchUkVehicleStatusFromCheckCar(registrationNumber, options);
  }
  return fetchUkVehicleStatusFromDvla(registrationNumber);
}

function latestMileageMilesFromVehicleStatus(status) {
  const direct = Number(status?.mileage?.valueMiles || 0);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const history = Array.isArray(status?.motHistory) ? status.motHistory : [];
  for (const row of history) {
    const miles = Number(row?.odometerMiles || 0);
    if (Number.isFinite(miles) && miles > 0) return miles;
  }
  return null;
}

async function detectUkRegistrationWithOpenAiFromImageBuffer(buffer) {
  if (!OPENAI_API_KEY || !buffer) {
    return { ok: false, registrationNumber: null, error: "openai_unavailable" };
  }
  const mime = "image/png";
  const b64 = buffer.toString("base64");
  const imageUrl = `data:${mime};base64,${b64}`;
  const prompt = [
    "Extract the UK vehicle registration plate from this image.",
    "Return strict JSON only with keys: registrationNumber, confidence, alternatives.",
    "registrationNumber: best single plate string.",
    "confidence: number between 0 and 1.",
    "alternatives: array of up to 3 alternative plate strings.",
  ].join(" ");

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: UK_PLATE_OCR_OPENAI_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      return {
        ok: false,
        registrationNumber: null,
        error: String(j?.error?.message || `openai_plate_http_${r.status}`),
      };
    }
    const raw = String(j?.choices?.[0]?.message?.content || "").trim();
    let parsed = {};
    try {
      parsed = raw ? JSON.parse(raw) : {};
    } catch {
      parsed = {};
    }

    const mainRaw = String(parsed?.registrationNumber || "");
    const alternativesRaw = Array.isArray(parsed?.alternatives) ? parsed.alternatives : [];
    const allCandidates = unique(
      [mainRaw, ...alternativesRaw]
        .map((x) => normalizeUkReg(String(x || "")))
        .filter((x) => looksLikeUkRegistration(x))
    ).slice(0, 4);
    if (!allCandidates.length) {
      return {
        ok: false,
        registrationNumber: null,
        error: "No UK registration detected in image.",
      };
    }
    const confidenceRaw = Number(parsed?.confidence);
    const confidence = Number.isFinite(confidenceRaw)
      ? Math.max(0, Math.min(1, confidenceRaw))
      : 0.78;
    const ambiguous = allCandidates.length > 1;
    const highConfidence = confidence >= UK_PLATE_AUTO_ACCEPT_CONFIDENCE && !ambiguous;
    return {
      ok: true,
      registrationNumber: allCandidates[0],
      confidence: Number(confidence.toFixed(3)),
      highConfidence,
      ambiguous,
      candidates: allCandidates.map((reg, idx) => ({
        registrationNumber: reg,
        score: Number(Math.max(0.4, confidence - idx * 0.18).toFixed(3)),
        hits: 1,
        reasons: ["openai_vision"],
      })),
      source: "openai_vision",
    };
  } catch (err) {
    return {
      ok: false,
      registrationNumber: null,
      error: `OpenAI plate detection failed: ${String(err?.message || err)}`,
    };
  }
}

async function detectUkRegistrationFromImageBuffer(buffer) {
  const client = getVisionClient();
  if (!buffer) return { ok: false, registrationNumber: null, error: "image_unavailable" };
  if (!client) {
    const openAiFallback = await detectUkRegistrationWithOpenAiFromImageBuffer(buffer);
    if (openAiFallback?.ok) return openAiFallback;
    return { ok: false, registrationNumber: null, error: openAiFallback?.error || "image_unavailable" };
  }
  try {
    const [textRes] = await client.textDetection({ image: { content: buffer } });
    const fullText = String(textRes.fullTextAnnotation?.text || "");
    const topText = String(textRes.textAnnotations?.[0]?.description || "");
    const textTokens = (textRes.textAnnotations || [])
      .slice(1)
      .map((a) => String(a?.description || ""))
      .filter(Boolean);
    const primaryTokens = `${fullText}\n${topText}\n${textTokens.join(" ")}`.split(/\s+/).filter(Boolean);

    const primaryRanking = buildUkRegCandidateRanking(
      `${fullText}\n${topText}\n${textTokens.join(" ")}`,
      primaryTokens,
      1
    );
    const quick = finalizeUkRegConfidence(primaryRanking);
    if (quick.ok && quick.highConfidence) {
      return { ...quick, source: "vision_ocr_text" };
    }

    const [docTextRes] = await client.documentTextDetection({ image: { content: buffer } });
    const docFullText = String(docTextRes.fullTextAnnotation?.text || "");
    const docTopText = String(docTextRes.textAnnotations?.[0]?.description || "");
    const docTokens = (docTextRes.textAnnotations || [])
      .slice(1)
      .map((a) => String(a?.description || ""))
      .filter(Boolean);

    const docRanking = buildUkRegCandidateRanking(
      `${docFullText}\n${docTopText}\n${docTokens.join(" ")}`,
      `${docFullText}\n${docTopText}\n${docTokens.join(" ")}`.split(/\s+/).filter(Boolean),
      0.9
    );
    const docResult = finalizeUkRegConfidence(docRanking);
    const merged = new Map();
    for (const candidate of primaryRanking) {
      scoreUkRegCandidateMap(merged, candidate.reg, candidate.score, "primary_ocr");
    }
    for (const candidate of docRanking) {
      scoreUkRegCandidateMap(merged, candidate.reg, candidate.score, "document_ocr");
    }
    const mergedRanking = Array.from(merged.values()).sort((a, b) => b.score - a.score);
    const finalResult = finalizeUkRegConfidence(mergedRanking);
    const quickReg = quick?.registrationNumber || null;
    const docReg = docResult?.registrationNumber || null;
    const doubleMatchOk = Boolean(quickReg && docReg && quickReg === docReg);
    if (UK_PLATE_REQUIRE_DOUBLE_MATCH && !doubleMatchOk) {
      const topRegs = [quickReg, docReg, finalResult?.registrationNumber]
        .filter(Boolean)
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .slice(0, 3);
      return {
        ...finalResult,
        highConfidence: false,
        ambiguous: true,
        error: `Double-read mismatch (${topRegs.join(" / ")}). Manual confirmation required.`,
        source: "vision_ocr_merged_double_mismatch",
      };
    }
    return {
      ...finalResult,
      doubleMatch: doubleMatchOk,
      source: "vision_ocr_merged",
    };
  } catch (err) {
    const errText = String(err?.message || err || "");
    if (/permission_denied|billing to be enabled/i.test(errText)) {
      visionInitFailed = true;
      visionClient = null;
    }
    const openAiFallback = await detectUkRegistrationWithOpenAiFromImageBuffer(buffer);
    if (openAiFallback?.ok) return openAiFallback;
    return { ok: false, registrationNumber: null, error: `Plate detection failed: ${String(err?.message || err)}` };
  }
}

// --- routes ---
app.get("/", (req, res) => {
  const hostHeader = String(req.headers.host || "").trim();
  const requestHost = hostHeader.includes(":") ? hostHeader.split(":")[0] : hostHeader || "127.0.0.1";
  const lanHosts = getLanHosts();
  const primaryHost = isLocalHostName(requestHost) && lanHosts.length ? lanHosts[0] : requestHost;
  const hostCandidates = Array.from(new Set([primaryHost, requestHost, ...lanHosts].filter(Boolean))).slice(0, 4);
  const envExpoPort = Number(process.env.EXPO_WEB_PORT || process.env.EXPO_PORT || 8081);
  const expoPortCandidates = Array.from(
    new Set([envExpoPort, 8081, 8082, 8083].filter((port) => Number.isFinite(port) && port > 0))
  );
  const expoPrimaryPort = expoPortCandidates[0] || 8081;
  const expoWebUrl = `http://${primaryHost}:${expoPrimaryPort}`;
  const expoGoUrl = `exp://${primaryHost}:${expoPrimaryPort}`;
  const healthUrl = `http://${primaryHost}:${PORT}/health`;
  const extraExpoLinks = expoPortCandidates
    .slice(1)
    .map(
      (port) =>
        `<li>Fallback Expo web (${port}): <code>http://${primaryHost}:${port}</code> • Expo Go: <code>exp://${primaryHost}:${port}</code></li>`
    )
    .join("");
  const hostLinks = hostCandidates
    .slice(1)
    .map(
      (candidate) =>
        `<li>Alternate host: <code>http://${candidate}:${expoPrimaryPort}</code> • Expo Go: <code>exp://${candidate}:${expoPrimaryPort}</code></li>`
    )
    .join("");

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ValueVision Launch</title>
  <style>
    :root { color-scheme: light; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: linear-gradient(140deg, #0f1c33 0%, #183a66 60%, #1c5f7a 100%);
      color: #e8f2ff;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      width: min(720px, 100%);
      background: rgba(8, 20, 39, 0.88);
      border: 1px solid rgba(154, 195, 255, 0.35);
      border-radius: 18px;
      padding: 24px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
    }
    h1 {
      margin: 0 0 8px;
      font-size: 30px;
      line-height: 1.15;
    }
    p { margin: 8px 0 16px; color: #c8dcf8; }
    .row { display: flex; flex-wrap: wrap; gap: 10px; margin: 14px 0; }
    a.btn {
      text-decoration: none;
      font-weight: 700;
      font-size: 15px;
      border-radius: 12px;
      padding: 12px 14px;
      border: 1px solid #2f70dd;
      background: #0f49a8;
      color: #eef6ff;
      display: inline-block;
    }
    a.btn.alt {
      border-color: #2b8f7e;
      background: #167a6a;
    }
    code {
      background: rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      padding: 2px 6px;
      color: #dbeaff;
    }
    .small { font-size: 13px; color: #b9d0ee; }
    ul { margin: 10px 0; padding-left: 18px; }
  </style>
</head>
<body>
  <main class="card">
    <h1>ValueVision Is Live</h1>
    <p>Use one of the buttons below to launch the app.</p>
    <div class="row">
      <a class="btn" href="${expoWebUrl}" target="_blank" rel="noopener noreferrer">Open App In Browser</a>
      <a class="btn alt" href="${expoGoUrl}">Open In Expo Go</a>
    </div>
    <p class="small">If Expo Go does not open from this device, scan the LAN QR from the terminal and use <code>${expoGoUrl}</code> on your phone.</p>
    <ul class="small">
      <li>Expo web: <code>${expoWebUrl}</code></li>
      <li>Expo Go: <code>${expoGoUrl}</code></li>
      ${extraExpoLinks}
      ${hostLinks}
      <li>Backend health: <code>${healthUrl}</code></li>
    </ul>
  </main>
</body>
</html>`);
});

app.get("/health", (req, res) => {
  res.json({ ok: true, port: PORT });
});

app.get("/ebay/search", async (req, res) => {
  try {
    const q = String(req.query?.q || "").trim();
    const limit = Number(req.query?.limit || 10);
    const marketplaceId = String(req.query?.marketplace || EBAY_MARKETPLACE_ID).trim();
    const result = await fetchEbaySearch(q, { limit, marketplaceId });
    if (!result.ok) return res.status(400).json(result);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

app.get("/launch-readiness", (req, res) => {
  const usage = getCheckcarUsageSnapshot();
  const isProd = String(process.env.NODE_ENV || "").toLowerCase() === "production";
  const allowedOriginsConfigured = ALLOWED_ORIGINS.length > 0;
  const softLimitHealthy = !usage.limits.softActive || usage.total < Number(usage.limits.soft || 0);
  const hardLimitHealthy = !usage.limits.hardActive || usage.total < Number(usage.limits.hard || 0);
  const paidPolicy = paidAccessPolicySummary();
  const monetizationProtectionConfigured =
    !isProd ||
    !paidPolicy.enforceVehicleData ||
    (paidPolicy.mode !== "open" && (paidPolicy.mode !== "token" || paidPolicy.tokenConfigured));
  const checks = {
    backendReachable: true,
    nodeEnvProduction: isProd,
    allowedOriginsConfigured,
    serpApiConfigured: Boolean(SERPAPI_KEY),
    dvlaConfigured: Boolean(DVLA_VEHICLE_API_KEY || CHECKCAR_API_KEY),
    openAiConfigured: Boolean(OPENAI_API_KEY),
    corsConfiguredForProd: !isProd || allowedOriginsConfigured,
    checkcarPrimaryConfigured: Boolean(CHECKCAR_API_KEY && CHECKCAR_URL_TEMPLATE),
    checkcarEnrichmentConfigured: Boolean(
      CHECKCAR_UKVEHICLEDATA_URL_TEMPLATE && CHECKCAR_CARHISTORY_URL_TEMPLATE
    ),
    checkcarValuationConfigured: Boolean(CHECKCAR_VALUATION_URL_TEMPLATE),
    checkcarSoftLimitHealthy: softLimitHealthy,
    checkcarHardLimitHealthy: hardLimitHealthy,
    betaStrictMode: BETA_STRICT_MODE,
    monetizationProtectionConfigured,
  };
  const readyScore = Object.values(checks).filter(Boolean).length;
  const blockers = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([key]) => key);
  return res.json({
    ok: true,
    checks,
    blockers,
    readyScore,
    maxScore: Object.keys(checks).length,
    monetization: paidPolicy,
  });
});

app.get("/provider-usage", (req, res) => {
  const usage = getCheckcarUsageSnapshot();
  const cost = estimateCheckcarCostGbp(usage);
  const paidUsage = getPaidAccessUsageSnapshot();
  const soft = Number(usage?.limits?.soft || 0);
  const hard = Number(usage?.limits?.hard || 0);
  const total = Number(usage?.total || 0);
  return res.json({
    ok: true,
    provider: "checkcardetails",
    usage,
    cost,
    monetizationUsage: paidUsage,
    headroom: {
      toSoftLimitCalls: soft > 0 ? Math.max(0, soft - total) : null,
      toHardLimitCalls: hard > 0 ? Math.max(0, hard - total) : null,
    },
    policy: {
      skipEnrichmentAtSoftLimit: CHECKCAR_SKIP_ENRICH_AT_SOFT_LIMIT,
      enforceHardLimit: CHECKCAR_ENFORCE_HARD_LIMIT,
      paidAccess: paidAccessPolicySummary(),
    },
  });
});

app.get("/monetization-policy", (req, res) => {
  return res.json({
    ok: true,
    policy: paidAccessPolicySummary(),
    usage: getPaidAccessUsageSnapshot(),
  });
});

app.get("/car-sold-comps", (req, res) => {
  try {
    const make = String(req.query?.make || "").trim();
    const model = String(req.query?.model || "").trim();
    const year = Number(req.query?.year || 0) || null;
    const mileage = Number(req.query?.mileage || 0) || null;
    const region = String(req.query?.region || "uk").trim().toLowerCase();
    const limit = Number(req.query?.limit || 40) || 40;
    if (!make || !model) {
      return res.status(400).json({ ok: false, error: "make and model are required query params." });
    }
    const out = lookupCarSoldComps({ make, model, year, mileage, region, limit });
    return res.json({
      ok: true,
      query: { make, model, year, mileage, region, limit },
      summary: out.summary,
      comps: out.comps.map((row) => ({
        make: row.make,
        model: row.model,
        variant: row.variant,
        year: row.year,
        price: row.price,
        currency: row.currency,
        odometerKm: row.odometerKm,
        soldAt: row.soldAt,
        location: row.location,
      })),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

app.get("/sold-comps/manual", (req, res) => {
  try {
    const category = String(req.query?.category || "general").trim().toLowerCase();
    const query = String(req.query?.query || "").trim();
    const limit = Number(req.query?.limit || 80) || 80;
    const out = lookupManualSoldComps({ category, query, limit });
    return res.json({
      ok: true,
      query: { category, query, limit },
      summary: out.summary,
      comps: out.comps,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

app.post("/sold-comps/manual", express.json(), (req, res) => {
  try {
    const title = String(req.body?.title || "").trim();
    const category = String(req.body?.category || "general").trim().toLowerCase();
    const soldPrice = Number(req.body?.soldPrice || 0);
    const currency = String(req.body?.currency || "USD").trim().toUpperCase();
    const brand = String(req.body?.brand || "").trim();
    const model = String(req.body?.model || "").trim();
    const year = Number(req.body?.year || 0) || null;
    const soldAt = String(req.body?.soldAt || new Date().toISOString()).trim();
    const source = String(req.body?.source || "manual").trim();
    if (!title || !Number.isFinite(soldPrice) || soldPrice <= 0) {
      return res.status(400).json({ ok: false, error: "title and positive soldPrice are required." });
    }
    const row = {
      id: marketplaceId("msc"),
      title,
      titleNorm: normalizeText(title),
      category: normalizeText(category || "general"),
      soldPrice: Number(soldPrice.toFixed(2)),
      currency,
      brand: brand || null,
      model: model || null,
      brandNorm: normalizeText(brand || ""),
      modelNorm: normalizeText(model || ""),
      year,
      soldAt,
      source,
      createdAt: new Date().toISOString(),
    };
    appendManualSoldComp(row);
    return res.status(201).json({ ok: true, row });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

app.post("/sold-comps/manual/import-csv", upload.single("file"), (req, res) => {
  try {
    let csvText = "";
    if (req.file?.buffer) {
      csvText = req.file.buffer.toString("utf8");
    } else if (typeof req.body?.csv === "string") {
      csvText = req.body.csv;
    }
    if (!csvText.trim()) {
      return res.status(400).json({ ok: false, error: "CSV content is required (file or csv field)." });
    }
    const defaultCategory = String(req.body?.category || "general").trim().toLowerCase();
    const defaultCurrency = String(req.body?.currency || "USD").trim().toUpperCase();
    const rows = parseCsvText(csvText);
    let imported = 0;
    let skipped = 0;
    for (const rawRow of rows.slice(0, 15000)) {
      const title = String(rawRow.title || rawRow.item || rawRow.name || "").trim();
      const soldPrice = Number(rawRow.soldprice || rawRow.price || rawRow.sold || 0);
      if (!title || !Number.isFinite(soldPrice) || soldPrice <= 0) {
        skipped += 1;
        continue;
      }
      const row = {
        id: marketplaceId("msc"),
        title,
        titleNorm: normalizeText(title),
        category: normalizeText(rawRow.category || defaultCategory),
        soldPrice: Number(soldPrice.toFixed(2)),
        currency: String(rawRow.currency || defaultCurrency).toUpperCase(),
        brand: String(rawRow.brand || "").trim() || null,
        model: String(rawRow.model || "").trim() || null,
        brandNorm: normalizeText(rawRow.brand || ""),
        modelNorm: normalizeText(rawRow.model || ""),
        year: Number(rawRow.year || 0) || null,
        soldAt: String(rawRow.soldat || rawRow.date || new Date().toISOString()).trim(),
        source: String(rawRow.source || "csv-import").trim(),
        createdAt: new Date().toISOString(),
      };
      appendManualSoldComp(row);
      imported += 1;
    }
    return res.json({ ok: true, imported, skipped, totalRows: rows.length });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

app.get("/valuation/accuracy-dashboard", (req, res) => {
  try {
    const days = Number(req.query?.days || 30) || 30;
    const dashboard = buildAccuracyDashboard({ days });
    return res.json({ ok: true, dashboard });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

app.post("/valuation/benchmark", express.json(), async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) {
      return res.status(400).json({ ok: false, error: "rows[] is required." });
    }
    const baseUrl = `http://127.0.0.1:${PORT}`;
    const results = [];
    let sumAbsPct = 0;
    let counted = 0;
    for (const row of rows.slice(0, 60)) {
      const expectedSold = Number(row?.expectedSoldPrice || 0);
      if (!Number.isFinite(expectedSold) || expectedSold <= 0) continue;
      const payload = {
        itemQuery: String(row?.itemQuery || ""),
        category: String(row?.category || "general"),
        region: String(row?.region || "us"),
        condition: String(row?.condition || "used"),
        conditionTier: String(row?.conditionTier || "good"),
        vehicleYear: Number(row?.vehicleYear || 0) || null,
        vehicleMileage: Number(row?.vehicleMileage || 0) || null,
        vehicleMake: String(row?.vehicleMake || ""),
        vehicleModel: String(row?.vehicleModel || ""),
      };
      const resp = await fetch(`${baseUrl}/analyze`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await resp.json();
      const predicted = Number(json?.pricing?.median || 0);
      const absPct = predicted > 0 ? Math.abs(predicted - expectedSold) / expectedSold * 100 : null;
      if (Number.isFinite(absPct)) {
        sumAbsPct += absPct;
        counted += 1;
      }
      results.push({
        query: payload.itemQuery,
        category: payload.category,
        predictedMedian: predicted || null,
        expectedSoldPrice: expectedSold,
        absErrorPct: Number.isFinite(absPct) ? Number(absPct.toFixed(2)) : null,
      });
    }
    return res.json({
      ok: true,
      rows: results,
      metrics: {
        sampleSize: results.length,
        matched: counted,
        mapePct: counted ? Number((sumAbsPct / counted).toFixed(2)) : null,
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

app.post("/uk-vehicle-status", express.json(), async (req, res) => {
  try {
    const registrationNumber = String(req.body?.registrationNumber || "").trim();
    const wantsFullCarCheck = String(req.body?.fullCarCheck || "0") === "1";
    if (ENFORCE_PAID_ACCESS_FOR_VEHICLE_DATA && wantsFullCarCheck) {
      const paidAccess = evaluatePaidAccess(req, { featureLabel: "Full car check" });
      if (!paidAccess.allow) {
        incrementPaidAccessUsage("blocked_fullcar_check", 1);
        return res.status(paidAccess.status || 402).json({
          ok: false,
          code: paidAccess.code || "paid_access_required",
          error: paidAccess.message || "Full car check requires paid access.",
          monetization: {
            ...paidAccessPolicySummary(),
            decision: {
              allow: paidAccess.allow,
              code: paidAccess.code,
              mode: paidAccess.mode,
              requestPaidFlag: paidAccess.requestPaidFlag,
              tokenValid: paidAccess.tokenValid,
            },
          },
        });
      }
      incrementPaidAccessUsage("allowed_fullcar_check", 1);
    }
    const result = await fetchUkVehicleStatus(registrationNumber, {
      includeUkVehicleData: wantsFullCarCheck,
      includeCarHistory: wantsFullCarCheck,
    });
    if (!result.ok) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

// Cheap scanner-only mode: OCR plate extraction without paid status/history/valuation lookups.
app.post("/uk-plate-scan", upload.single("image"), async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({
        ok: false,
        error: "Missing image upload. Send multipart/form-data with field name 'image'.",
      });
    }
    const scan = await detectUkRegistrationFromImageBuffer(req.file.buffer);
    if (!scan?.ok || !scan?.registrationNumber) {
      return res.status(200).json({
        ok: true,
        detected: false,
        registrationNumber: null,
        confidence: Number(scan?.confidence || 0),
        highConfidence: false,
        ambiguous: Boolean(scan?.ambiguous),
        source: scan?.source || null,
        candidates: Array.isArray(scan?.candidates) ? scan.candidates.slice(0, 5) : [],
        error: scan?.error || null,
      });
    }
    return res.json({
      ok: true,
      detected: true,
      registrationNumber: normalizeUkReg(scan.registrationNumber),
      confidence: Number(scan.confidence || 0),
      highConfidence: Boolean(scan.highConfidence),
      ambiguous: Boolean(scan.ambiguous),
      source: scan.source || null,
      candidates: Array.isArray(scan.candidates) ? scan.candidates.slice(0, 5) : [],
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

app.post("/feedback-outcome", express.json(), (req, res) => {
  try {
    const category = String(req.body?.category || "general").toLowerCase();
    const region = String(req.body?.region || "us").toLowerCase();
    const predictedMedian = Number(req.body?.predictedMedian || 0);
    const soldPrice = Number(req.body?.soldPrice || 0);
    if (!Number.isFinite(predictedMedian) || predictedMedian <= 0 || !Number.isFinite(soldPrice) || soldPrice <= 0) {
      return res.status(400).json({ ok: false, error: "predictedMedian and soldPrice must be positive numbers." });
    }

    const store = loadOutcomeStore();
    const key = `${category}|${region}`;
    const ratio = soldPrice / predictedMedian;
    const prev = Number(store?.calibration?.[key]?.factor || 1);
    const next = prev * 0.8 + ratio * 0.2;
    store.calibration[key] = {
      factor: Math.max(0.7, Math.min(1.3, next)),
      updatedAt: new Date().toISOString(),
    };
    store.outcomes.push({
      createdAt: new Date().toISOString(),
      category,
      region,
      predictedMedian,
      soldPrice,
      ratio,
    });
    store.outcomes = store.outcomes.slice(-1000);
    saveOutcomeStore();

    return res.json({ ok: true, calibration: store.calibration[key] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

app.post("/voice/transcribe", upload.single("audio"), async (req, res) => {
  try {
    if (!OPENAI_API_KEY) {
      return res.status(400).json({
        ok: false,
        error: "OPENAI_API_KEY is missing on backend. Add it to backend/.env and restart backend.",
      });
    }
    if (!req.file?.buffer) {
      return res.status(400).json({ ok: false, error: "Missing audio upload." });
    }

    const fileName = String(req.file.originalname || "speech.m4a");
    const mimeType = String(req.file.mimetype || "audio/m4a");
    const blob = new Blob([req.file.buffer], { type: mimeType });
    const body = new FormData();
    body.append("file", blob, fileName);
    body.append("model", "gpt-4o-mini-transcribe");
    body.append("language", "en");
    body.append("temperature", "0");

    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body,
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      return res.status(502).json({
        ok: false,
        error: String(j?.error?.message || `Transcription failed (${r.status}).`),
      });
    }

    const text = String(j?.text || "").trim();
    if (!text) {
      return res.status(200).json({ ok: true, text: "", warning: "No speech detected." });
    }
    return res.json({ ok: true, text });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

function inferCategoryHintFromTranscript(text) {
  const t = normalizeText(text || "");
  if (!t) return null;
  if (/\b(car|vehicle|number plate|plate|registration|mot|tax|van|truck)\b/.test(t)) return "vehicle";
  if (/\b(laptop|iphone|ipad|macbook|phone|tablet|console|playstation|xbox)\b/.test(t)) return "electronics";
  if (/\b(hoodie|jeans|shirt|jacket|trainer|sneaker|dress|clothes|fashion)\b/.test(t)) return "fashion";
  if (/\b(drill|driver|saw|tool|dewalt|makita|milwaukee)\b/.test(t)) return "tools";
  if (/\b(coin|50p|note|book|isbn|collectible|antique|vintage|card|rock|mineral|crystal|fossil)\b/.test(t)) return "collectible";
  if (/\b(sofa|table|chair|furniture|lamp)\b/.test(t)) return "home";
  return null;
}

function shouldTriggerLiveScanFromTranscript(text) {
  const t = normalizeText(text || "");
  if (!t) return false;
  return /\b(scan|look|check|identify|value|worth|what is this|what's this|how much)\b/.test(t);
}

function fallbackLiveAssistantReply({ transcript, pricing, currencySymbol = "£" }) {
  const query = String(pricing?.query || pricing?.autoDetectedQuery || "").trim();
  const median = Number(pricing?.median || 0);
  const finalStatus = String(pricing?.finalStatus || "").toLowerCase();
  if (query && Number.isFinite(median) && median > 0 && finalStatus === "usable") {
    return `${query} looks identified. Current estimate is about ${currencySymbol}${Math.round(median)}.`;
  }
  if (query) {
    return `I can see ${query}. I need a clearer view or more detail before giving a fully reliable price.`;
  }
  if (transcript) {
    return "I heard you. Keep the item centered and steady, then I will identify it and estimate the value.";
  }
  return "Show me the item clearly and I will identify it and estimate what it is worth.";
}

app.post("/voice/live-assistant", express.json({ limit: "1mb" }), async (req, res) => {
  try {
    const transcript = String(req.body?.transcript || "").trim();
    const pricing = req.body?.pricing && typeof req.body.pricing === "object" ? req.body.pricing : {};
    const category = String(req.body?.category || pricing?.category || "general").toLowerCase();
    const region = String(req.body?.region || pricing?.region || "uk").toLowerCase();
    const market = MARKET_CONFIG[region] || MARKET_CONFIG.uk;
    const currencySymbol = pricing?.currencySymbol || market.symbol || "£";
    const fallbackReply = fallbackLiveAssistantReply({ transcript, pricing, currencySymbol });
    const categoryHintFallback = inferCategoryHintFromTranscript(transcript) || null;
    const shouldScanFallback = shouldTriggerLiveScanFromTranscript(transcript);

    if (!OPENAI_API_KEY) {
      return res.json({
        ok: true,
        reply: fallbackReply,
        shouldScan: shouldScanFallback,
        categoryHint: categoryHintFallback,
        source: "fallback",
      });
    }

    const promptContext = {
      transcript,
      category,
      pricing: {
        query: pricing?.query || pricing?.autoDetectedQuery || null,
        finalStatus: pricing?.finalStatus || null,
        median: Number.isFinite(Number(pricing?.median)) ? Number(pricing?.median) : null,
        low: Number.isFinite(Number(pricing?.low)) ? Number(pricing?.low) : null,
        high: Number.isFinite(Number(pricing?.high)) ? Number(pricing?.high) : null,
        currency: pricing?.currency || "GBP",
        confidenceLabel: pricing?.confidence?.label || null,
        confidenceScore: Number.isFinite(Number(pricing?.confidence?.score)) ? Number(pricing?.confidence?.score) : null,
      },
    };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are ValueVision Live Voice Assistant. Respond in UK English. Keep reply under 2 short sentences. " +
              "Only state a price when finalStatus is usable and median exists; otherwise ask for a clearer view or more details. " +
              "Never invent numbers. Return strict JSON: {\"reply\":\"...\",\"shouldScan\":true|false,\"categoryHint\":\"vehicle|electronics|fashion|home|collectible|tools|general|null\"}.",
          },
          {
            role: "user",
            content: JSON.stringify(promptContext),
          },
        ],
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      return res.json({
        ok: true,
        reply: fallbackReply,
        shouldScan: shouldScanFallback,
        categoryHint: categoryHintFallback,
        source: "fallback",
        warning: String(j?.error?.message || `live assistant http ${r.status}`),
      });
    }

    let parsed = null;
    try {
      parsed = JSON.parse(String(j?.choices?.[0]?.message?.content || "{}"));
    } catch {}
    const rawReply = String(parsed?.reply || "").trim();
    const reply = rawReply || fallbackReply;
    const hintedCategory = String(parsed?.categoryHint || "").trim().toLowerCase();
    const allowed = new Set(["vehicle", "electronics", "fashion", "home", "collectible", "tools", "general"]);
    const categoryHint = allowed.has(hintedCategory)
      ? hintedCategory
      : categoryHintFallback;
    const shouldScan = typeof parsed?.shouldScan === "boolean"
      ? parsed.shouldScan
      : shouldScanFallback;
    return res.json({
      ok: true,
      reply,
      shouldScan,
      categoryHint: categoryHint || null,
      source: "openai",
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

/**
 * POST /analyze
 * Form-data: image (file)
 * Body (optional JSON): labels[] (if you already detected labels on-device)
 *
 * We’ll price from "labels" if provided, otherwise we price from a generic term.
 */
app.post("/analyze", upload.single("image"), async (req, res) => {
  try {
    const startedAt = Date.now();
    const isLiveMode = String(req.body?.liveMode || "0") === "1";
    const isQuickMode = String(req.body?.quickMode || "0") === "1";
    const stage = String(req.body?.stage || (isQuickMode ? "fast" : "refine")).toLowerCase();
    const isFastStage = stage === "fast";
    const analyzeBudgetMs = isLiveMode ? LIVE_ANALYZE_BUDGET_MS : ANALYZE_BUDGET_MS;
    const serpTimeoutMs = isLiveMode ? LIVE_SERP_TIMEOUT_MS : SERPAPI_TIMEOUT_MS;
    const effectiveBudgetMs = isFastStage
      ? Math.min(5200, analyzeBudgetMs)
      : analyzeBudgetMs;
    const effectiveSerpTimeoutMs = isFastStage
      ? Math.min(2200, serpTimeoutMs)
      : serpTimeoutMs;
    // You can send labels from the app; if none, we use a fallback query.
    let labels = [];
    try {
      if (req.body && req.body.labels) {
        // could be a JSON string or a comma string
        if (typeof req.body.labels === "string") {
          try {
            labels = JSON.parse(req.body.labels);
          } catch {
            labels = req.body.labels.split(",").map((s) => s.trim()).filter(Boolean);
          }
        } else if (Array.isArray(req.body.labels)) {
          labels = req.body.labels;
        }
      }
    } catch {}

    let manualItemQuery = String(req.body?.itemQuery || "").trim();
    const condition = String(req.body?.condition || "used").trim().toLowerCase();
    const conditionTier = String(req.body?.conditionTier || "good").trim().toLowerCase();
    const conditionNotes = String(req.body?.conditionNotes || "").trim();
    let vehicleYear = Number(req.body?.vehicleYear || 0) || null;
    let vehicleMileage = Number(req.body?.vehicleMileage || 0) || null;
    let vehicleReg = normalizeUkReg(String(req.body?.vehicleReg || ""));
    const vehicleMake = String(req.body?.vehicleMake || "").trim();
    const vehicleModel = String(req.body?.vehicleModel || "").trim();
    const vehicleFuelType = String(req.body?.vehicleFuelType || "").trim();
    const vehicleTransmission = String(req.body?.vehicleTransmission || "").trim();
    const vehicleTrim = String(req.body?.vehicleTrim || "").trim();
    const vehicleServiceHistory = String(req.body?.vehicleServiceHistory || "").trim();
    const vehicleOwners = String(req.body?.vehicleOwners || "").trim();
    const vehicleAccidentFlags = String(req.body?.vehicleAccidentFlags || "").trim();
    const vehicleMods = String(req.body?.vehicleMods || "").trim();
    const vehicleKnownFaults = String(req.body?.vehicleKnownFaults || "").trim();
    const top = labels.slice(0, 5).filter(Boolean);
    const requestedCategory = String(req.body?.category || "auto").trim().toLowerCase();
    const requestedRegion = String(req.body?.region || "uk").trim().toLowerCase();
    const wantsFullCarCheck = String(req.body?.fullCarCheck || "0") === "1";
    const buyPrice = Number(req.body?.buyPrice || 0) || null;
    const market = MARKET_CONFIG[requestedRegion] || MARKET_CONFIG.us;
    const autoCategory = detectCategory(manualItemQuery, labels);
    const validCategories = new Set(["auto", "vehicle", "electronics", "fashion", "home", "collectible", "tools", "general"]);
    let category = validCategories.has(requestedCategory) && requestedCategory !== "auto" ? requestedCategory : autoCategory;
    let ukVehicleStatus = null;
    let ukVehicleStatusError = null;
    let vehicleRegDetected = null;
    let vehicleRegDetection = {
      source: vehicleReg ? "manual" : "none",
      confidence: vehicleReg ? 1 : 0,
      highConfidence: Boolean(vehicleReg),
      ambiguous: false,
    };
    let soldCompsBenchmark = null;
    let itemProfile = null;

    let baseQuery = manualItemQuery || (top.length ? top.join(" ") : "");
    let autoDetection = null;
    const ultraFastDetection = isFastStage && (requestedCategory === "vehicle" || requestedCategory === "auto");
    if (!baseQuery && req.file?.buffer) {
      autoDetection = await detectItemFromImageBuffer(req.file.buffer, {
        fast: isLiveMode || isFastStage,
        ultraFast: ultraFastDetection,
      });
      if (autoDetection?.ok) {
        baseQuery = autoDetection.query;
        const detectedCategory = String(autoDetection?.category || "").trim().toLowerCase();
        if (
          requestedCategory === "auto" &&
          validCategories.has(detectedCategory) &&
          detectedCategory !== "auto"
        ) {
          category = detectedCategory;
        }
        if (!labels.length && Array.isArray(autoDetection.labels)) {
          labels = autoDetection.labels;
        }
      }
    }
    if (requestedRegion === "uk" && !vehicleReg && autoDetection?.firstTextLine) {
      const regFromTextLine = extractUkRegFromText(autoDetection.firstTextLine);
      if (regFromTextLine && looksLikeModernUkRegistration(regFromTextLine)) {
        vehicleReg = regFromTextLine;
        vehicleRegDetected = regFromTextLine;
        vehicleRegDetection = {
          source: "ocr_textline",
          confidence: 0.72,
          highConfidence: false,
          ambiguous: false,
        };
      }
    }
    if (requestedCategory === "auto") {
      category = detectCategory(baseQuery, labels);
    }
    const shouldGateVehicleProviderData =
      ENFORCE_PAID_ACCESS_FOR_VEHICLE_DATA &&
      requestedRegion === "uk" &&
      (
        requestedCategory === "vehicle" ||
        category === "vehicle" ||
        wantsFullCarCheck ||
        Boolean(vehicleReg)
      );
    if (shouldGateVehicleProviderData) {
      const paidAccess = evaluatePaidAccess(req, {
        featureLabel: wantsFullCarCheck ? "Full car check" : "Vehicle pricing",
      });
      if (!paidAccess.allow) {
        incrementPaidAccessUsage("blocked_vehicle_pricing", 1);
        const provisional = buildProvisionalPricing({
          query: baseQuery || manualItemQuery || "UK vehicle",
          category: "vehicle",
          region: requestedRegion,
          market,
          conditionTier,
          condition,
          vehicleYear,
          confidenceScore: 16,
          reason:
            paidAccess.message ||
            "Vehicle pricing requires paid access. No paid provider calls were made.",
        });
        provisional.low = null;
        provisional.median = null;
        provisional.high = null;
        provisional.finalStatus = "needs_details";
        provisional.confidence = { score: 18, label: "low" };
        provisional.confidenceReasons = unique([
          ...(provisional.confidenceReasons || []),
          "paid vehicle data access not unlocked",
        ]);
        provisional.qualityGate = {
          status: "hold",
          score: 20,
          metrics: { compCount: 0, sourceCount: 0, avgMatchScore: 0, spreadPct: 1 },
          reasons: ["paid vehicle data access not unlocked"],
        };
        provisional.vehicleStatus = null;
        provisional.vehicleStatusError = paidAccess.message;
        provisional.vehicleRegDetected = vehicleRegDetected || vehicleReg || null;
        provisional.stage = stage;
        provisional.refineRecommended = false;
        provisional.monetization = {
          ...paidAccessPolicySummary(),
          decision: {
            allow: paidAccess.allow,
            code: paidAccess.code,
            mode: paidAccess.mode,
            requestPaidFlag: paidAccess.requestPaidFlag,
            tokenValid: paidAccess.tokenValid,
          },
        };
        return res.json({
          labels,
          pricing: withholdProvisionalNumbers(
            provisional,
            "paid access required for vehicle provider data"
          ),
        });
      }
      incrementPaidAccessUsage("allowed_vehicle_pricing", 1);
    }

    if (category !== "vehicle" && requestedCategory !== "vehicle") {
      const barcodeOnlyManual =
        Boolean(manualItemQuery) &&
        (/^\s*(barcode|isbn)\b/i.test(manualItemQuery) ||
          /^\d{8,14}$/.test(String(manualItemQuery).replace(/\s+/g, "")));
      const barcodeEnrichment = await enrichQueryFromBarcodeSignals({
        manualItemQuery,
        baseQuery,
        conditionNotes,
        labels,
      });
      if (barcodeEnrichment?.query && (!manualItemQuery || barcodeOnlyManual)) {
        baseQuery = barcodeEnrichment.query;
        if (!manualItemQuery || barcodeOnlyManual) {
          manualItemQuery = barcodeEnrichment.query;
        }
        if (requestedCategory === "auto" && validCategories.has(barcodeEnrichment.categoryHint)) {
          category = barcodeEnrichment.categoryHint;
        }
      }
    }

    itemProfile = buildUniversalItemProfile({
      query: baseQuery,
      labels,
      category: requestedCategory,
      region: requestedRegion,
      condition,
      conditionTier,
      vehicleMake,
      vehicleModel,
      vehicleYear,
      vehicleMileage,
      vehicleReg,
    });
    if (requestedCategory === "auto" && itemProfile?.categoryRouted) {
      category = itemProfile.categoryRouted;
    }
    if (!baseQuery && isLiveMode) {
      baseQuery = liveFallbackQuery(category, conditionNotes);
    }
    const shouldTryUkPlateDetection = Boolean(
      requestedRegion === "uk" &&
      !vehicleReg &&
      req.file?.buffer &&
      (
        category === "vehicle" ||
        requestedCategory === "vehicle" ||
        /\b(car|vehicle|number plate|plate|registration|reg|van|truck|suv|hatchback)\b/i.test(
          `${manualItemQuery} ${baseQuery}`
        )
      )
    );
    if (shouldTryUkPlateDetection) {
      const regGuess = await detectUkRegistrationFromImageBuffer(req.file.buffer);
      if (regGuess?.ok && regGuess.registrationNumber) {
        vehicleRegDetected = regGuess.registrationNumber;
        vehicleRegDetection = {
          source: "ocr_ranked",
          confidence: Number(regGuess.confidence || 0),
          highConfidence: Boolean(regGuess.highConfidence),
          ambiguous: Boolean(regGuess.ambiguous),
        };
        if (regGuess.highConfidence) {
          vehicleReg = regGuess.registrationNumber;
        } else if (regGuess.ambiguous) {
          const options = (regGuess.candidates || []).slice(0, 3).map((c) => c.registrationNumber).join(" or ");
          const confidence = Number(regGuess.confidence || 0);
          const canTryProvisional = confidence >= UK_PLATE_PROVISIONAL_LOOKUP_CONFIDENCE
            && looksLikeModernUkRegistration(regGuess.registrationNumber);
          if (canTryProvisional) {
            vehicleReg = regGuess.registrationNumber;
            ukVehicleStatusError =
              `Plate detection uncertain (${options}). Running provisional MOT/tax lookup for ${regGuess.registrationNumber}; please confirm plate manually.`;
          } else {
            ukVehicleStatusError = `Plate detection uncertain (${options}). Enter registration manually and tap Check MOT & Tax.`;
          }
        } else {
          const confidence = Number(regGuess.confidence || 0);
          const canTryProvisional = confidence >= UK_PLATE_PROVISIONAL_LOOKUP_CONFIDENCE
            && looksLikeModernUkRegistration(regGuess.registrationNumber);
          if (canTryProvisional) {
            vehicleReg = regGuess.registrationNumber;
            ukVehicleStatusError =
              `Plate confidence ${(confidence * 100).toFixed(0)}% is below auto-accept threshold. ` +
              `Running provisional MOT/tax lookup for ${regGuess.registrationNumber}; confirm plate manually.`;
          } else {
            ukVehicleStatusError =
              `Plate detection confidence ${(confidence * 100).toFixed(0)}% is below threshold. ` +
              "Enter registration manually and tap Check MOT & Tax.";
          }
        }
      } else if (regGuess?.error) {
        ukVehicleStatusError = regGuess.error;
      }
    }
    if (requestedRegion === "uk" && vehicleReg) {
      const manualRegProvided = Boolean(normalizeUkReg(String(req.body?.vehicleReg || "")));
      const makeHint = detectVehicleMakeHint(
        `${manualItemQuery} ${baseQuery} ${(autoDetection?.query || "")} ${(labels || []).join(" ")}`
      );
      if (manualRegProvided) {
        vehicleRegDetection = {
          source: "manual",
          confidence: 1,
          highConfidence: true,
          ambiguous: false,
        };
      }

      if (manualRegProvided) {
        const status = await fetchUkVehicleStatus(vehicleReg, {
          allowStaleCache: true,
          includeUkVehicleData: wantsFullCarCheck,
          includeCarHistory: wantsFullCarCheck,
        });
        if (status?.ok) {
          ukVehicleStatus = status;
          if (!vehicleYear && Number.isFinite(status.yearOfManufacture)) {
            vehicleYear = Number(status.yearOfManufacture);
          }
          if (!vehicleMileage) {
            const statusMiles = latestMileageMilesFromVehicleStatus(status);
            if (Number.isFinite(statusMiles) && statusMiles > 0) vehicleMileage = statusMiles;
          }
        } else {
          ukVehicleStatusError = String(status?.error || "Could not fetch UK vehicle status.");
        }
      } else {
        const retryRegs = [vehicleReg, ...generateUkRegRetryCandidates(vehicleReg)].slice(
          0,
          Math.max(1, UK_OCR_STATUS_LOOKUP_MAX * 2)
        );
        const seen = new Set();
        const okCandidates = [];
        let firstError = "";
        for (const candidateReg of retryRegs) {
          if (seen.has(candidateReg)) continue;
          seen.add(candidateReg);
          const candidateStatus = await fetchUkVehicleStatus(candidateReg, {
            allowStaleCache: true,
            includeUkVehicleData: wantsFullCarCheck,
            includeCarHistory: wantsFullCarCheck,
          });
          if (candidateStatus?.ok) {
            okCandidates.push({
              reg: candidateReg,
              status: candidateStatus,
              isOriginal: candidateReg === vehicleReg,
            });
            if (okCandidates.length >= UK_OCR_STATUS_LOOKUP_MAX) break;
          } else if (!firstError) {
            firstError = String(candidateStatus?.error || "");
          }
        }

        if (!okCandidates.length) {
          if (firstError && /not found|404/i.test(firstError)) {
            ukVehicleStatusError = "Plate detection uncertain. Enter registration manually and tap Check MOT & Tax.";
          } else {
            ukVehicleStatusError = firstError || "Could not fetch UK vehicle status.";
          }
        } else {
          const picked = selectBestUkStatusCandidate(okCandidates, makeHint);
          const autoPlateNeedsManualConfirm =
            vehicleRegDetection.source !== "manual" &&
            (!vehicleRegDetection.highConfidence ||
              vehicleRegDetection.ambiguous ||
              Number(vehicleRegDetection.confidence || 0) < UK_PLATE_AUTO_ACCEPT_CONFIDENCE);
          const makeHintNorm = normalizeMakeName(makeHint || "");
          const pickedMakeNorm = normalizeMakeName(picked?.best?.status?.make || "");
          const makeHintMatched = Boolean(
            makeHintNorm && pickedMakeNorm && pickedMakeNorm.includes(makeHintNorm)
          );
          if (picked.ambiguous) {
            ukVehicleStatus = null;
            ukVehicleStatusError = `Plate detection uncertain: ${picked.all
              .slice(0, 3)
              .map((x) => x.reg)
              .join(" or ")}. Enter plate manually and tap Check MOT & Tax.`;
          } else if (autoPlateNeedsManualConfirm && !makeHintMatched) {
            ukVehicleStatus = null;
            ukVehicleStatusError =
              `Plate detection needs confirmation (${vehicleReg}). ` +
              "Enter registration manually and tap Check MOT & Tax.";
          } else {
            ukVehicleStatus = picked.best.status;
            if (picked.best.reg !== vehicleReg) {
              vehicleRegDetected = picked.best.reg;
              ukVehicleStatusError = `Plate auto-corrected from ${vehicleReg} to ${picked.best.reg}.`;
              vehicleReg = picked.best.reg;
            }
            if (!vehicleYear && Number.isFinite(picked.best.status.yearOfManufacture)) {
              vehicleYear = Number(picked.best.status.yearOfManufacture);
            }
            if (!vehicleMileage) {
              const statusMiles = latestMileageMilesFromVehicleStatus(picked.best.status);
              if (Number.isFinite(statusMiles) && statusMiles > 0) vehicleMileage = statusMiles;
            }
          }
        }
      }
    } else if (requestedRegion === "uk" && (category === "vehicle" || requestedCategory === "vehicle")) {
      ukVehicleStatusError = ukVehicleStatusError || "No UK registration detected in image.";
    }
    if ((category === "vehicle" || requestedCategory === "vehicle") && ukVehicleStatus?.make) {
      const make = normalizeText(ukVehicleStatus.make);
      const statusVehicleQuery = `${ukVehicleStatus.make || ""} ${ukVehicleStatus.model || ""}`.trim();
      // When no manual query is provided, trust plate-verified make/model over noisy OCR labels.
      if (!manualItemQuery && statusVehicleQuery) {
        baseQuery = statusVehicleQuery;
      } else if (baseQuery && !normalizeText(baseQuery).includes(make)) {
        baseQuery = `${statusVehicleQuery || ukVehicleStatus.make} ${baseQuery}`.trim();
      } else if (!baseQuery) {
        baseQuery = statusVehicleQuery || `${ukVehicleStatus.make} car`;
      }
    }
    if (requestedCategory === "auto" && ukVehicleStatus?.make && category !== "vehicle") {
      category = "vehicle";
    }
    if (category === "vehicle" && !/\b(tire|tyre|wheel|rim|alloy)\b/i.test(baseQuery || "")) {
      baseQuery = buildVehicleValuationQuery({
        query: baseQuery,
        registration: vehicleRegDetected || vehicleReg || "",
        make: vehicleMake || ukVehicleStatus?.make || "",
        model: vehicleModel || ukVehicleStatus?.model || "",
        year: vehicleYear || ukVehicleStatus?.yearOfManufacture || null,
      });
    }
    // UK vehicle valuations must be anchored to a verified registration identity.
    // If plate OCR is uncertain or status lookup fails, do not return a final value.
    if (requestedRegion === "uk" && category === "vehicle" && !ukVehicleStatus?.ok) {
      const provisional = buildProvisionalPricing({
        query: baseQuery || manualItemQuery || "UK vehicle",
        category,
        region: requestedRegion,
        market,
        conditionTier,
        condition,
        vehicleYear,
        confidenceScore: 14,
        reason:
          ukVehicleStatusError ||
          "Registration could not be verified. Enter plate manually and tap Check MOT & Tax.",
      });
      provisional.low = null;
      provisional.median = null;
      provisional.high = null;
      provisional.finalStatus = "needs_details";
      provisional.confidence = { score: 20, label: "low" };
      provisional.confidenceReasons = unique([
        ...(provisional.confidenceReasons || []),
        "registration identity not verified",
      ]);
      provisional.qualityGate = {
        status: "hold",
        score: 18,
        metrics: { compCount: 0, sourceCount: 0, avgMatchScore: 0, spreadPct: 1 },
        reasons: ["registration could not be verified"],
      };
      provisional.vehicleStatus = null;
      provisional.vehicleStatusError =
        ukVehicleStatusError || "Registration could not be verified. Enter plate manually and retry.";
      provisional.vehicleRegDetected = vehicleRegDetected || vehicleReg || null;
      provisional.accuracy = {
        ready: false,
        score: 20,
        blockers: ["registration not verified", "vehicle identity uncertain"],
      };
      provisional.stage = stage;
      provisional.refineRecommended = false;
      provisional.fingerprint = fingerprintFromQuery({
        query: baseQuery || manualItemQuery || "",
        labels,
        category,
        condition,
        region: requestedRegion,
        vehicleYear,
      });
      return res.json({ labels, pricing: provisional });
    }
    const fingerprint = fingerprintFromQuery({
      query: baseQuery || manualItemQuery || "",
      labels,
      category,
      condition,
      region: requestedRegion,
      vehicleYear,
    });
    const providerRateLimited = () => lastError === "SERP_QUOTA_EXCEEDED";

    if (!baseQuery) {
      const provisional = buildProvisionalPricing({
        query: "",
        category: category || "general",
        region: requestedRegion,
        market,
        conditionTier,
        condition,
        vehicleYear,
        confidenceScore: 10,
        reason:
          autoDetection?.error ||
          "Could not detect item yet. Returning provisional estimate.",
      });
      provisional.stage = stage;
      provisional.refineRecommended = isFastStage;
      provisional.fingerprint = fingerprint;
      provisional.confidenceReasons = ["item detection not stable yet"];
      provisional.vehicleStatus = ukVehicleStatus;
      provisional.vehicleStatusError = ukVehicleStatusError;
      provisional.vehicleRegDetected = vehicleRegDetected;
      provisional.qualityGate = {
        status: "hold",
        score: 15,
        metrics: { compCount: 0, sourceCount: 0, avgMatchScore: 0, spreadPct: 1 },
        reasons: ["item detection not stable yet"],
      };
      return res.json({ labels, pricing: withholdProvisionalNumbers(provisional, "item detection not stable") });
    }

    // Fast path: for UK vehicles with a confirmed plate, return provider valuation
    // before expensive live web lookups to reduce timeout risk and quota burn.
    if (requestedRegion === "uk" && category === "vehicle" && (vehicleRegDetected || vehicleReg)) {
      const valuationFromStatus = valuationSummaryFromVehicleStatus(ukVehicleStatus);
      const shouldFetchDirectValuation =
        !valuationFromStatus || Number(valuationFromStatus.count || 0) < 4;
      const valuationLookup = shouldFetchDirectValuation
        ? await fetchUkVehicleValuationFromCheckCar({
            registrationNumber: vehicleRegDetected || vehicleReg,
            mileage: vehicleMileage || latestMileageMilesFromVehicleStatus(ukVehicleStatus),
            allowStaleCache: true,
            timeoutMs: 3500,
          })
        : null;
      const valuationSummary = valuationLookup?.ok && valuationLookup.summary
        ? valuationLookup.summary
        : valuationFromStatus;
      if (valuationSummary) {
        const valuationPricing = pricingFromVehicleValuation({
          valuation: valuationSummary,
          query: baseQuery,
          category,
          region: requestedRegion,
          market,
          conditionTier,
          condition,
          vehicleYear: vehicleYear || ukVehicleStatus?.yearOfManufacture || null,
          stage,
          fingerprint,
          ukVehicleStatus,
          ukVehicleStatusError,
          vehicleRegDetected: vehicleRegDetected || vehicleReg,
        });
        if (valuationPricing) {
          return res.json({ labels, pricing: valuationPricing });
        }
      }

      // Tertiary fast path: learned make/model baseline from prior successful
      // UK valuations so we can still return a grounded price quickly.
      const baselineSummary = getUkModelBaselineSummary({
        make: vehicleMake || ukVehicleStatus?.make || "",
        model: vehicleModel || ukVehicleStatus?.model || "",
        year: vehicleYear || ukVehicleStatus?.yearOfManufacture || null,
      });
      if (baselineSummary && Number(baselineSummary.count || 0) >= 3) {
        const baselinePricing = pricingFromVehicleValuation({
          valuation: baselineSummary,
          query: baseQuery,
          category,
          region: requestedRegion,
          market,
          conditionTier,
          condition,
          vehicleYear: vehicleYear || ukVehicleStatus?.yearOfManufacture || null,
          stage,
          fingerprint,
          ukVehicleStatus,
          ukVehicleStatusError,
          vehicleRegDetected: vehicleRegDetected || vehicleReg,
        });
        if (baselinePricing) {
          baselinePricing.provisionalReason = "Using learned UK model baseline from prior validated valuations.";
          return res.json({ labels, pricing: baselinePricing });
        }
      }

      // Secondary fast path: local sold-car benchmark fallback (no live web calls)
      // to avoid long-tail timeout cases on plate-only runs.
      const parsedVehicle = parseMakeModelFromVehicleQuery(
        baseQuery,
        vehicleMake || ukVehicleStatus?.make || "",
        vehicleModel || ukVehicleStatus?.model || ""
      );
      if (parsedVehicle.make && parsedVehicle.model) {
        const soldCompsLookup = lookupCarSoldComps({
          make: parsedVehicle.make,
          model: parsedVehicle.model,
          region: requestedRegion,
          year: vehicleYear || ukVehicleStatus?.yearOfManufacture || null,
          mileage: vehicleMileage,
          limit: 80,
          query: baseQuery,
        });
        if (soldCompsLookup?.summary?.count >= 3) {
          const benchmark = {
            make: parsedVehicle.make || null,
            model: parsedVehicle.model || null,
            ...soldCompsLookup.summary,
          };
          const provisional = buildProvisionalPricing({
            query: baseQuery,
            category,
            region: requestedRegion,
            market,
            conditionTier,
            condition,
            vehicleYear: vehicleYear || ukVehicleStatus?.yearOfManufacture || null,
            confidenceScore: 54,
            reason: "Using local sold benchmark while live pricing is unavailable.",
          });
          provisional.low = benchmark.low;
          provisional.median = benchmark.median;
          provisional.high = benchmark.high;
          provisional.currency = benchmark.currency || provisional.currency;
          provisional.qualityGate = {
            status: "caution",
            score: 60,
            metrics: { compCount: benchmark.count, sourceCount: 1, avgMatchScore: 74, spreadPct: 0.4 },
            reasons: ["plate identity confirmed; using local sold benchmark"],
          };
          provisional.confidence = { score: 59, label: "medium" };
          provisional.confidenceReasons = ["local sold benchmark fallback", "vehicle make/model matched"];
          provisional.stage = stage;
          provisional.refineRecommended = isFastStage;
          provisional.fingerprint = fingerprint;
          provisional.vehicleStatus = ukVehicleStatus;
          provisional.vehicleStatusError = ukVehicleStatusError;
          provisional.vehicleRegDetected = vehicleRegDetected;
          provisional.soldCompsBenchmark = benchmark;
          provisional.comps = soldCompsLookup.comps
            .slice(0, 5)
            .map((row) => ({
              title: `${row.year || ""} ${row.make || ""} ${row.model || ""} ${row.variant || ""}`.trim(),
              price: `${row.currency || "GBP"} ${row.price}`,
              source: "soldcartracker",
              link: row.rawUrl || "",
            }));
          return res.json({ labels, pricing: applyVehicleBenchmarkReadiness(provisional, benchmark, ukVehicleStatus) });
        }
      }

      const fastFallback = buildProvisionalPricing({
        query: baseQuery,
        category,
        region: requestedRegion,
        market,
        conditionTier,
        condition,
        vehicleYear: vehicleYear || ukVehicleStatus?.yearOfManufacture || null,
        confidenceScore: 28,
        reason: "Insufficient verified comps for this registration yet. Showing provisional range.",
      });
      fastFallback.stage = stage;
      fastFallback.refineRecommended = isFastStage;
      fastFallback.fingerprint = fingerprint;
      fastFallback.vehicleStatus = ukVehicleStatus;
      fastFallback.vehicleStatusError = ukVehicleStatusError;
      fastFallback.vehicleRegDetected = vehicleRegDetected;
      fastFallback.qualityGate = {
        status: "hold",
        score: 32,
        metrics: { compCount: 0, sourceCount: 0, avgMatchScore: 0, spreadPct: 1 },
        reasons: ["insufficient verified pricing comps for this plate"],
      };
      fastFallback.confidenceReasons = ["fast fallback for plate-based lookup", "awaiting stronger model-specific comps"];
      return res.json({
        labels,
        pricing: withholdProvisionalNumbers(
          fastFallback,
          "insufficient verified comps for this registration"
        ),
      });
    }

    const vehicleDetails = [
      vehicleMake,
      vehicleModel,
      vehicleTrim,
      vehicleYear ? String(vehicleYear) : "",
      vehicleMileage ? `${vehicleMileage} miles` : "",
      vehicleFuelType,
      vehicleTransmission,
      vehicleServiceHistory,
      vehicleOwners ? `${vehicleOwners} owners` : "",
      vehicleAccidentFlags,
      vehicleMods,
      vehicleKnownFaults,
    ]
      .filter(Boolean)
      .join(" ");
    const enriched = `${baseQuery} ${condition} ${vehicleDetails} ${conditionNotes}`.trim();
    let queryCandidates = buildQueryCandidates(category, enriched, baseQuery, requestedRegion).slice(
      0,
      isLiveMode
        ? MAX_QUERY_CANDIDATES_LIVE
        : isFastStage
          ? 1
          : MAX_QUERY_CANDIDATES
    );
    if (isFastStage && category === "vehicle") {
      queryCandidates = unique([`${baseQuery} used car price`, ...queryCandidates]).slice(0, 1);
    }
    const ckey = cacheKey({
      query: baseQuery,
      category,
      region: requestedRegion,
      condition,
      conditionTier,
    });
    const bypassCache = category === "vehicle";
    if (isFastStage) {
      const cached = bypassCache ? null : getCachedPricing(ckey);
      if (cached) {
        return res.json({
          labels,
          pricing: {
            ...cached.pricing,
            stage,
            fromCache: true,
            cacheAgeSec: cached.ageSec,
            refineRecommended: false,
          },
        });
      }
    }

    let rawResults = [];
    let lastError = "";
    const doWebSearch =
      !isFastStage &&
      (
        category === "vehicle" ||
        category === "general" ||
        category === "home" ||
        category === "tools" ||
        category === "fashion" ||
        category === "collectible"
      );

    for (const q of queryCandidates) {
      if (Date.now() - startedAt > effectiveBudgetMs) break;
      const shop = await serpApiShoppingSearch(q, market, effectiveSerpTimeoutMs);
      let web = { ok: false, results: [], error: "" };
      if (!isLiveMode && doWebSearch && Date.now() - startedAt <= effectiveBudgetMs - 1200) {
        web = await serpApiWebSearch(q, market, effectiveSerpTimeoutMs);
      }

      if (web.ok) {
        rawResults = rawResults.concat(
          (web.results || []).map((r) => ({
            title: r.title || "Item",
            source: r.source || r.displayed_link || "",
            link: r.link || "",
            price: "",
            extracted_price: parsePriceFromText(`${r.title || ""} ${r.snippet || ""}`),
            soldHint: /sold|recent sales|completed/.test(q.toLowerCase()),
          }))
        );
      }

      if (shop.ok) {
        rawResults = rawResults.concat(
          (shop.results || []).map((r) => ({
            ...r,
            soldHint:
              /sold|recent sales|completed/.test(q.toLowerCase()) ||
              /sold|pre-?owned|used/i.test(String(r?.title || "")),
          }))
        );
      }

      if (!web.ok && !shop.ok) {
        const combinedError = `${web.error || ""} ${shop.error || ""}`.trim();
        if (isSerpQuotaError(combinedError)) {
          lastError = "SERP_QUOTA_EXCEEDED";
          break;
        }
        lastError = web.error || shop.error || "Pricing failed";
      }
      if (rawResults.length >= 18) break;
    }

    if (!rawResults.length && category === "vehicle" && Date.now() - startedAt <= effectiveBudgetMs - 900) {
      const rescueQueries = buildVehicleRescueQueries({
        baseQuery,
        make: vehicleMake || ukVehicleStatus?.make || "",
        model: vehicleModel || ukVehicleStatus?.model || "",
        year: vehicleYear || ukVehicleStatus?.yearOfManufacture || null,
      });
      for (const rq of rescueQueries) {
        if (Date.now() - startedAt > effectiveBudgetMs) break;
        const rescueShop = await serpApiShoppingSearch(rq, market, Math.min(7000, effectiveSerpTimeoutMs + 1800));
        if (rescueShop.ok) {
          rawResults = rawResults.concat(
            (rescueShop.results || []).map((r) => ({
              ...r,
              soldHint: /sold|pre-?owned|used/i.test(String(r?.title || "")),
            }))
          );
        } else if (!lastError) {
          lastError = rescueShop.error || "Vehicle rescue lookup failed";
        }
        if (rawResults.length >= 12) break;
      }
    }

    if (!rawResults.length) {
      const cached = bypassCache ? null : getCachedPricing(ckey);
      if (cached) {
        return res.json({
          labels,
          pricing: {
            ...cached.pricing,
            fromCache: true,
            cacheAgeSec: cached.ageSec,
          },
        });
      }
      if (category === "vehicle") {
        const valuationFromStatus = valuationSummaryFromVehicleStatus(ukVehicleStatus);
        const shouldFetchDirectValuation =
          requestedRegion === "uk" &&
          (vehicleRegDetected || vehicleReg) &&
          (!valuationFromStatus || Number(valuationFromStatus.count || 0) < 4);
        const valuationLookup =
          shouldFetchDirectValuation
            ? await fetchUkVehicleValuationFromCheckCar({
                registrationNumber: vehicleRegDetected || vehicleReg,
                mileage: vehicleMileage || latestMileageMilesFromVehicleStatus(ukVehicleStatus),
              })
            : null;
        const valuationSummary = valuationLookup?.ok && valuationLookup.summary
          ? valuationLookup.summary
          : valuationFromStatus;
        if (valuationSummary) {
          const valuationPricing = pricingFromVehicleValuation({
            valuation: valuationSummary,
            query: baseQuery,
            category,
            region: requestedRegion,
            market,
            conditionTier,
            condition,
            vehicleYear: vehicleYear || ukVehicleStatus?.yearOfManufacture || null,
            stage,
            fingerprint,
            ukVehicleStatus,
            ukVehicleStatusError,
            vehicleRegDetected: vehicleRegDetected || vehicleReg,
          });
          if (valuationPricing) {
            return res.json({ labels, pricing: valuationPricing });
          }
        }

        const parsedVehicle = parseMakeModelFromVehicleQuery(
          baseQuery,
          vehicleMake || ukVehicleStatus?.make || "",
          vehicleModel || ukVehicleStatus?.model || ""
        );
        const soldCompsLookup = lookupCarSoldComps({
          make: parsedVehicle.make,
          model: parsedVehicle.model,
          region: requestedRegion,
          year: vehicleYear || ukVehicleStatus?.yearOfManufacture || null,
          mileage: vehicleMileage,
          limit: 80,
          query: baseQuery,
        });
        const ukWebBenchmarkLookup =
          requestedRegion === "uk"
            ? await lookupUkVehicleWebBenchmark({
                make: parsedVehicle.make,
                model: parsedVehicle.model,
                year: vehicleYear || ukVehicleStatus?.yearOfManufacture || null,
                market,
              })
            : null;
        const benchmarkSourceSummary =
          ukWebBenchmarkLookup?.summary?.count >= 3
            ? ukWebBenchmarkLookup.summary
            : soldCompsLookup?.summary || null;
        if (benchmarkSourceSummary?.count >= 3) {
          const benchmark = {
            make: parsedVehicle.make || null,
            model: parsedVehicle.model || null,
            ...benchmarkSourceSummary,
          };
          const benchmarkSource = String(benchmark.source || "").toLowerCase();
          const benchmarkReason =
            benchmarkSource === "uk-web-benchmark"
              ? "Using UK web vehicle benchmark due to sparse live comps."
              : (
                  providerRateLimited()
                    ? "Live pricing provider limit reached. Using sold-car benchmark."
                    : (lastError || "Using sold-car benchmark due to sparse live market data.")
                );
          const provisional = buildProvisionalPricing({
            query: baseQuery,
            category,
            region: requestedRegion,
            market,
            conditionTier,
            condition,
            vehicleYear: vehicleYear || ukVehicleStatus?.yearOfManufacture || null,
            confidenceScore: benchmarkSource === "uk-web-benchmark" ? 66 : 52,
            reason: benchmarkReason,
          });
          provisional.low = benchmark.low;
          provisional.median = benchmark.median;
          provisional.high = benchmark.high;
          provisional.currency = benchmark.currency || provisional.currency;
          provisional.qualityGate = {
            status: "caution",
            score: benchmarkSource === "uk-web-benchmark" ? 70 : 58,
            metrics: { compCount: benchmark.count, sourceCount: 1, avgMatchScore: 74, spreadPct: 0.42 },
            reasons: [
              benchmarkSource === "uk-web-benchmark"
                ? "live pricing sparse; using UK web benchmark"
                : "live market lookup sparse; using sold-car benchmark",
            ],
          };
          provisional.confidence = {
            score: benchmarkSource === "uk-web-benchmark" ? 68 : 57,
            label: "medium",
          };
          provisional.confidenceReasons = benchmarkSource === "uk-web-benchmark"
            ? ["uk web benchmark fallback", "vehicle make/model matched"]
            : ["sold benchmark fallback", "vehicle make/model matched"];
          provisional.stage = stage;
          provisional.refineRecommended = isFastStage;
          provisional.fingerprint = fingerprint;
          provisional.vehicleStatus = ukVehicleStatus;
          provisional.vehicleStatusError = ukVehicleStatusError;
          provisional.vehicleRegDetected = vehicleRegDetected;
          provisional.soldCompsBenchmark = benchmark;
          provisional.comps = benchmarkSource === "uk-web-benchmark"
            ? (ukWebBenchmarkLookup?.comps || []).slice(0, 6)
            : soldCompsLookup.comps
                .slice(0, 5)
                .map((row) => ({
                  title: `${row.year || ""} ${row.make || ""} ${row.model || ""} ${row.variant || ""}`.trim(),
                  price: `${row.currency || "AUD"} ${row.price}`,
                  source: "soldcartracker",
                  link: row.rawUrl || "",
                }));
          return res.json({ labels, pricing: applyVehicleBenchmarkReadiness(provisional, benchmark, ukVehicleStatus) });
        }

      }
      if (category !== "vehicle") {
        const manualFallback = lookupManualSoldComps({
          category,
          query: baseQuery,
          region: requestedRegion,
          limit: 60,
        });
        const manualSummary = manualFallback?.summary || null;
        if (manualSummary && Number(manualSummary.count || 0) >= 3) {
          const provisional = buildProvisionalPricing({
            query: baseQuery,
            category,
            region: requestedRegion,
            market,
            conditionTier,
            condition,
            vehicleYear: vehicleYear || ukVehicleStatus?.yearOfManufacture || null,
            confidenceScore: 60,
            reason: providerRateLimited()
              ? "Live pricing provider limit reached. Using verified sold benchmark."
              : "No live listings found. Using verified sold benchmark.",
          });
          provisional.low = Number(manualSummary.low || provisional.low);
          provisional.median = Number(manualSummary.median || provisional.median);
          provisional.high = Number(manualSummary.high || provisional.high);
          provisional.currency = manualSummary.currency || provisional.currency;
          provisional.finalStatus = "usable";
          provisional.provisional = false;
          provisional.accuracy = {
            ready: Number(manualSummary.count || 0) >= 5,
            score: Number(manualSummary.count || 0) >= 5 ? 76 : 68,
            blockers: Number(manualSummary.count || 0) >= 5 ? [] : ["limited sold benchmark sample size"],
          };
          provisional.qualityGate = {
            status: "caution",
            score: 66,
            metrics: {
              compCount: Number(manualSummary.count || 0),
              sourceCount: 1,
              avgMatchScore: 78,
              spreadPct:
                Number(manualSummary.median || 0) > 0
                  ? Math.max(
                      0,
                      (Number(manualSummary.high || manualSummary.median) -
                        Number(manualSummary.low || manualSummary.median)) /
                        Number(manualSummary.median || 1)
                    )
                  : 0,
            },
            reasons: ["live comps unavailable; manual sold benchmark fallback"],
          };
          provisional.confidence = {
            score: 62,
            label: "medium",
          };
          provisional.confidenceReasons = [
            "manual sold benchmark fallback",
            "live market comps unavailable",
          ];
          provisional.stage = stage;
          provisional.refineRecommended = isFastStage;
          provisional.fingerprint = fingerprint;
          provisional.vehicleStatus = ukVehicleStatus;
          provisional.vehicleStatusError = ukVehicleStatusError;
          provisional.vehicleRegDetected = vehicleRegDetected;
          provisional.soldCompsBenchmark = manualSummary;
          provisional.comps = (manualFallback.comps || [])
            .slice(0, 6)
            .map((row) => ({
              title: row.title || "Manual sold comp",
              price: `${row.currency || manualSummary.currency || market.currency} ${row.soldPrice}`,
              source: row.source || "manual",
              link: "",
            }));
          return res.json({ labels, pricing: provisional });
        }
      }
      const provisional = buildProvisionalPricing({
        query: baseQuery,
        category,
        region: requestedRegion,
        market,
        conditionTier,
        condition,
        vehicleYear: vehicleYear || ukVehicleStatus?.yearOfManufacture || null,
        confidenceScore: 18,
        reason: providerRateLimited()
          ? "Live pricing provider limit reached. Showing local fallback estimate."
          : (lastError || "No market results found. Provisional estimate shown."),
      });
      provisional.stage = stage;
      provisional.refineRecommended = isFastStage;
      provisional.fingerprint = fingerprint;
      provisional.confidenceReasons = ["no priced listings returned for this query"];
      provisional.vehicleStatus = ukVehicleStatus;
      provisional.vehicleStatusError = ukVehicleStatusError;
      provisional.vehicleRegDetected = vehicleRegDetected;
      provisional.qualityGate = {
        status: "hold",
        score: 20,
        metrics: { compCount: 0, sourceCount: 0, avgMatchScore: 0, spreadPct: 1 },
        reasons: ["no priced listings returned for this query"],
      };
      const anchoredFallback = category !== "vehicle"
        ? applyQueryFallbackPricing({
            pricing: provisional,
            query: baseQuery,
            category,
            region: requestedRegion,
            conditionTier,
            condition,
            market,
            fallbackReason: provisional.provisionalReason,
          })
        : null;
      if (anchoredFallback) {
        return res.json({ labels, pricing: anchoredFallback });
      }
      return res.json({ labels, pricing: withholdProvisionalNumbers(provisional, "no priced listings returned") });
    }

    const comps = [];
    for (const r of rawResults) {
      const title = String(r.title || r.product_title || "Item");
      const priceStr = String(r.price || r.extracted_price || "");
      const source = String(r.source || r.merchant || "");
      const link = String(r.link || r.product_link || "");
      let n = Number.isFinite(r.extracted_price) ? Number(r.extracted_price) : parsePriceToNumber(priceStr);
      if (!Number.isFinite(n) && category !== "vehicle" && hasExplicitPriceHint(title)) {
        n = parsePriceFromText(title);
      }
      if (!Number.isFinite(n) && category === "vehicle" && hasExplicitPriceHint(`${priceStr} ${title}`)) {
        n = parsePriceFromText(`${priceStr} ${title}`);
      }
      if (Number.isFinite(n) && isLikelyYearPrice(n, title, priceStr)) {
        n = null;
      }
      let matchScore = scoreCompMatch(baseQuery, condition, title);
      if (category === "vehicle") {
        const variantScore = vehicleVariantMatchScore(baseQuery, title);
        matchScore += Math.min(14, variantScore.codeHits * 9 + variantScore.trimHits * 2);
      }
      const soldHint = Boolean(r.soldHint);
      const qualityPenalty = listingQualityPenalty({
        title,
        query: baseQuery,
        category,
        condition,
      });
      comps.push({ title, price: priceStr, source, link, n, matchScore, soldHint, qualityPenalty });
      if (comps.length >= 20) break;
    }
    const normalizedComps = dedupeAndSanityFilter(comps);

    // Keep only close title matches to avoid random comps.
    let matchThreshold =
      category === "vehicle" ? 62 :
      category === "electronics" ? 58 :
      category === "collectible" ? 60 :
      55;
    let matchedComps = normalizedComps.filter((c) => c.matchScore >= matchThreshold && (c.qualityPenalty || 0) < 0.8);
    const inferredVehicleYear = vehicleYear || extractYear(baseQuery);
    if (category === "vehicle" && Number.isFinite(inferredVehicleYear)) {
      matchedComps = matchedComps.filter((c) => hasCloseVehicleYear(c.title, inferredVehicleYear));
    }
    if (category === "vehicle") {
      matchedComps = matchedComps.filter((c) => compMatchesVehicleQuery(c.title, baseQuery));
    }
    if (category === "electronics") {
      matchedComps = matchedComps.filter((c) => compMatchesPhoneQuery(c.title, baseQuery));
    }
    if (category === "fashion") {
      matchedComps = matchedComps.filter((c) => compMatchesFashionQuery(c.title, baseQuery));
      matchedComps = matchedComps.filter((c) => compMatchesJewelryQuery(c.title, baseQuery));
    }
    if (category === "fashion" || category === "collectible") {
      const watchFiltered = matchedComps.filter((c) => compMatchesWatchQuery(c.title, baseQuery));
      if (watchFiltered.length >= 2) {
        matchedComps = watchFiltered;
      }
    }
    if (category === "collectible") {
      matchedComps = matchedComps.filter((c) => compMatchesCollectibleQuery(c.title, baseQuery));
    }
    if (category === "tools") {
      matchedComps = matchedComps.filter((c) => compMatchesToolQuery(c.title, baseQuery));
    }

    let minCompCount = category === "vehicle" || category === "collectible" ? 4 : 3;
    if (category === "fashion") minCompCount = 2;

    // Fallback for sparse categories (jewelry/fashion): relax threshold once.
    if ((category === "fashion" || category === "collectible") && matchedComps.length < minCompCount) {
      matchThreshold = Math.max(45, matchThreshold - 10);
      matchedComps = normalizedComps.filter((c) => c.matchScore >= matchThreshold);
      matchedComps = matchedComps.filter((c) => (c.qualityPenalty || 0) < 0.8);
    }

    // Recompute price arrays after any fallback threshold changes.
    const priceStrings = matchedComps.map((c) => c.price);
    const rawNums = matchedComps.map((c) => c.n).filter((n) => n !== null);
    let filteredNums = filterOutliersIQR(rawNums);
    let filteredSet = new Set(filteredNums);
    let filteredComps = matchedComps.filter((c) => Number.isFinite(c.n) && filteredSet.has(c.n));
    filteredComps = bandFilterByCategory(filteredComps, category);
    filteredComps = clipCompsByRobustStats(filteredComps, category);
    filteredNums = filteredComps.map((c) => c.n);

    // Final best-effort fallback: if still too sparse, use top scored numeric comps.
    if (filteredComps.length < minCompCount || filteredNums.length < minCompCount) {
      const bestEffort = matchedComps
        .filter((c) => Number.isFinite(c.n))
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, Math.max(minCompCount, 3));
      if (bestEffort.length >= 2) {
        filteredComps = bestEffort;
        filteredNums = bestEffort.map((c) => c.n);
      } else {
        if (category === "vehicle") {
          const valuationFromStatus = valuationSummaryFromVehicleStatus(ukVehicleStatus);
          const shouldFetchDirectValuation =
            requestedRegion === "uk" &&
            (vehicleRegDetected || vehicleReg) &&
            (!valuationFromStatus || Number(valuationFromStatus.count || 0) < 4);
          const valuationLookup =
            shouldFetchDirectValuation
              ? await fetchUkVehicleValuationFromCheckCar({
                  registrationNumber: vehicleRegDetected || vehicleReg,
                  mileage: vehicleMileage || latestMileageMilesFromVehicleStatus(ukVehicleStatus),
                })
              : null;
          const valuationSummary = valuationLookup?.ok && valuationLookup.summary
            ? valuationLookup.summary
            : valuationFromStatus;
          if (valuationSummary) {
            const valuationPricing = pricingFromVehicleValuation({
              valuation: valuationSummary,
              query: baseQuery,
              category,
              region: requestedRegion,
              market,
              conditionTier,
              condition,
              vehicleYear: inferredVehicleYear || vehicleYear || null,
              stage,
              fingerprint,
              ukVehicleStatus,
              ukVehicleStatusError,
              vehicleRegDetected: vehicleRegDetected || vehicleReg,
            });
            if (valuationPricing) {
              return res.json({ labels, pricing: valuationPricing });
            }
          }

          const parsedVehicle = parseMakeModelFromVehicleQuery(
            baseQuery,
            vehicleMake || ukVehicleStatus?.make || "",
            vehicleModel || ukVehicleStatus?.model || ""
          );
          const soldCompsLookup = lookupCarSoldComps({
            make: parsedVehicle.make,
            model: parsedVehicle.model,
            region: requestedRegion,
            year: inferredVehicleYear || vehicleYear || null,
            mileage: vehicleMileage,
            limit: 80,
            query: baseQuery,
          });
          const ukWebBenchmarkLookup =
            requestedRegion === "uk"
              ? await lookupUkVehicleWebBenchmark({
                  make: parsedVehicle.make,
                  model: parsedVehicle.model,
                  year: inferredVehicleYear || vehicleYear || null,
                  market,
                })
              : null;
          const benchmarkSourceSummary =
            ukWebBenchmarkLookup?.summary?.count >= 3
              ? ukWebBenchmarkLookup.summary
              : soldCompsLookup?.summary || null;
          if (benchmarkSourceSummary?.count >= 3) {
            const benchmark = {
              make: parsedVehicle.make || null,
              model: parsedVehicle.model || null,
              ...benchmarkSourceSummary,
            };
            const benchmarkSource = String(benchmark.source || "").toLowerCase();
            const benchmarkReason =
              benchmarkSource === "uk-web-benchmark"
                ? "Using UK web vehicle benchmark due to sparse live comps."
                : (
                    providerRateLimited()
                      ? "Live pricing provider limit reached. Using sold-car benchmark."
                      : "Using sold-car benchmark due to sparse live comps."
                  );
            const provisional = buildProvisionalPricing({
              query: baseQuery,
              category,
              region: requestedRegion,
              market,
              conditionTier,
              condition,
              vehicleYear: inferredVehicleYear || vehicleYear || null,
              confidenceScore: benchmarkSource === "uk-web-benchmark" ? 66 : 58,
              reason: benchmarkReason,
            });
            provisional.low = benchmark.low;
            provisional.median = benchmark.median;
            provisional.high = benchmark.high;
            provisional.currency = benchmark.currency || provisional.currency;
            provisional.qualityGate = {
              status: "caution",
              score: benchmarkSource === "uk-web-benchmark" ? 70 : 62,
              metrics: { compCount: benchmark.count, sourceCount: 1, avgMatchScore: 78, spreadPct: 0.36 },
              reasons: [
                benchmarkSource === "uk-web-benchmark"
                  ? "live comps sparse; fallback to UK web benchmark"
                  : "live comps sparse; fallback to sold-car benchmark",
              ],
            };
            provisional.confidence = {
              score: benchmarkSource === "uk-web-benchmark" ? 68 : 63,
              label: "medium",
            };
            provisional.confidenceReasons = benchmarkSource === "uk-web-benchmark"
              ? ["uk web benchmark fallback", "vehicle make/model matched"]
              : ["sold benchmark fallback", "vehicle make/model matched"];
            provisional.stage = stage;
            provisional.refineRecommended = isFastStage;
            provisional.fingerprint = fingerprint;
            provisional.vehicleStatus = ukVehicleStatus;
            provisional.vehicleStatusError = ukVehicleStatusError;
            provisional.vehicleRegDetected = vehicleRegDetected;
            provisional.soldCompsBenchmark = benchmark;
            provisional.comps = benchmarkSource === "uk-web-benchmark"
              ? (ukWebBenchmarkLookup?.comps || []).slice(0, 6)
              : soldCompsLookup.comps
                  .slice(0, 5)
                  .map((row) => ({
                    title: `${row.year || ""} ${row.make || ""} ${row.model || ""} ${row.variant || ""}`.trim(),
                    price: `${row.currency || "AUD"} ${row.price}`,
                    source: "soldcartracker",
                    link: row.rawUrl || "",
                  }));
            return res.json({ labels, pricing: applyVehicleBenchmarkReadiness(provisional, benchmark, ukVehicleStatus) });
          }
        }
        if (category !== "vehicle") {
          const manualFallback = lookupManualSoldComps({
            category,
            query: baseQuery,
            region: requestedRegion,
            limit: 60,
          });
          const manualSummary = manualFallback?.summary || null;
          if (manualSummary && Number(manualSummary.count || 0) >= 3) {
            const provisional = buildProvisionalPricing({
              query: baseQuery,
              category,
              region: requestedRegion,
              market,
              conditionTier,
              condition,
              vehicleYear: inferredVehicleYear || vehicleYear || null,
              confidenceScore: 60,
              reason: "Using verified sold benchmark due to sparse live comps.",
            });
            provisional.low = Number(manualSummary.low || provisional.low);
            provisional.median = Number(manualSummary.median || provisional.median);
            provisional.high = Number(manualSummary.high || provisional.high);
            provisional.currency = manualSummary.currency || provisional.currency;
            provisional.finalStatus = "usable";
            provisional.provisional = false;
            provisional.accuracy = {
              ready: Number(manualSummary.count || 0) >= 5,
              score: Number(manualSummary.count || 0) >= 5 ? 76 : 68,
              blockers: Number(manualSummary.count || 0) >= 5 ? [] : ["limited sold benchmark sample size"],
            };
            provisional.qualityGate = {
              status: "caution",
              score: 66,
              metrics: {
                compCount: Number(manualSummary.count || 0),
                sourceCount: 1,
                avgMatchScore: 78,
                spreadPct:
                  Number(manualSummary.median || 0) > 0
                    ? Math.max(
                        0,
                        (Number(manualSummary.high || manualSummary.median) -
                          Number(manualSummary.low || manualSummary.median)) /
                          Number(manualSummary.median || 1)
                      )
                    : 0,
              },
              reasons: ["live comps sparse; manual sold benchmark fallback"],
            };
            provisional.confidence = {
              score: 62,
              label: "medium",
            };
            provisional.confidenceReasons = [
              "manual sold benchmark fallback",
              "live market comps too sparse",
            ];
            provisional.soldCompsBenchmark = manualSummary;
            provisional.comps = (manualFallback.comps || [])
              .slice(0, 6)
              .map((row) => ({
                title: row.title || "Manual sold comp",
                price: `${row.currency || manualSummary.currency || market.currency} ${row.soldPrice}`,
                source: row.source || "manual",
                link: "",
              }));
            return res.json({ labels, pricing: provisional });
          }
        }
        const provisional = buildProvisionalPricing({
          query: baseQuery,
          category,
          region: requestedRegion,
          market,
          conditionTier,
          condition,
          vehicleYear: inferredVehicleYear || vehicleYear || null,
          confidenceScore: 22,
          reason: providerRateLimited()
            ? "Live pricing provider limit reached. Showing local fallback estimate."
            : "Not enough close market matches. Provisional estimate shown.",
        });
        provisional.stage = stage;
        provisional.refineRecommended = isFastStage;
        provisional.fingerprint = fingerprint;
        provisional.confidenceReasons = ["not enough close title/model matches"];
        provisional.vehicleStatus = ukVehicleStatus;
        provisional.vehicleStatusError = ukVehicleStatusError;
        provisional.vehicleRegDetected = vehicleRegDetected;
        provisional.qualityGate = {
          status: "hold",
          score: 30,
          metrics: { compCount: 1, sourceCount: 1, avgMatchScore: 55, spreadPct: 1 },
          reasons: ["not enough close title/model matches"],
        };
        provisional.comps = normalizedComps
          .sort((a, b) => b.matchScore - a.matchScore)
          .slice(0, 5)
          .map(({ title, price, source, link }) => ({ title, price, source, link }));
        const anchoredFallback = category !== "vehicle"
          ? applyQueryFallbackPricing({
              pricing: provisional,
              query: baseQuery,
              category,
              region: requestedRegion,
              conditionTier,
              condition,
              market,
              fallbackReason: provisional.provisionalReason,
            })
          : null;
        if (anchoredFallback) {
          return res.json({ labels, pricing: anchoredFallback });
        }
        return res.json({ labels, pricing: withholdProvisionalNumbers(provisional, "not enough close matches") });
      }
    }

    const weights = filteredComps.map((c) => {
      const soldBoost = c.soldHint ? 1.35 : 1;
      const sourceWeight = sourceReliabilityWeight(c.source, category);
      const qualityWeight = Math.max(0.2, 1 - Number(c.qualityPenalty || 0));
      return Math.max(0.5, (c.matchScore / 10) * soldBoost * sourceWeight * qualityWeight);
    });
    let med = weightedMedian(filteredComps.map((c) => c.n), weights) ?? median(filteredNums);
    const currency = guessCurrencyFromPrices(priceStrings, market.currency);
    let low = filteredNums.length ? Math.min(...filteredNums) : null;
    let high = filteredNums.length ? Math.max(...filteredNums) : null;
    const sourceCount = unique(filteredComps.map((c) => c.source).filter(Boolean)).length;
    let confidence = confidenceFromStats(rawNums.length, sourceCount, filteredNums.length);
    const consensus = sourceConsensusStats(filteredComps);
    if (consensus.lowConsensus) {
      const penalty = Math.min(18, Math.round(consensus.consensusSpreadPct * 20));
      const nextScore = Math.max(0, Number(confidence.score || 0) - penalty);
      confidence = {
        score: nextScore,
        label: confidenceLabelFromScore(nextScore),
      };
    }
    const removedLowQuality = matchedComps.filter((c) => Number(c.qualityPenalty || 0) >= 0.45).length;
    const confidenceReasonList = buildConfidenceReasons({
      confidence,
      rawCount: rawNums.length,
      filteredCount: filteredNums.length,
      sourceCount,
      category,
      matchedComps: filteredComps,
    });
    if (removedLowQuality > 0) {
      confidenceReasonList.push(`filtered ${removedLowQuality} low-quality listings`);
    }
    if (consensus.lowConsensus) {
      confidenceReasonList.push("sources disagree on price band");
    }
    let gate = qualityGate({
      category,
      filteredComps,
      filteredNums,
      sourceCount,
      confidence,
    });
    let vehicleAdjustments = null;

    if (category === "vehicle" && Number.isFinite(med)) {
      const adj = estimateVehicleAdjustment({
        year: inferredVehicleYear,
        mileage: vehicleMileage,
        conditionNotes,
        condition,
      });
      med = med * adj.factor;
      low = Number.isFinite(low) ? low * adj.factor : low;
      high = Number.isFinite(high) ? high * adj.factor : high;
      vehicleAdjustments = {
        factor: adj.factor,
        reasons: adj.reasons,
      };
    }

    const tierAdj = conditionTierFactor(conditionTier);
    med = Number.isFinite(med) ? med * tierAdj.factor : med;
    low = Number.isFinite(low) ? low * tierAdj.factor : low;
    high = Number.isFinite(high) ? high * tierAdj.factor : high;

    const calibrated = applyCalibrationFactor({
      category,
      region: requestedRegion,
      low,
      median: med,
      high,
    });
    med = calibrated.median;
    low = calibrated.low;
    high = calibrated.high;

    const policy = applyConfidenceRangePolicy({
      low,
      median: med,
      high,
      confidenceLabel: confidence.label,
    });
    low = policy.low;
    med = policy.median;
    high = policy.high;

    const memoryAdjusted = applyMemoryPrior({
      category,
      region: requestedRegion,
      fingerprintKey: fingerprint.key,
      median: med,
    });
    if (Number.isFinite(memoryAdjusted.median) && Number.isFinite(med)) {
      const memFactor = memoryAdjusted.adjustmentFactor;
      med = memoryAdjusted.median;
      low = Number.isFinite(low) ? low * memFactor : low;
      high = Number.isFinite(high) ? high * memFactor : high;
    }

    itemProfile = buildUniversalItemProfile({
      query: baseQuery,
      labels,
      category,
      region: requestedRegion,
      condition,
      conditionTier,
      vehicleMake: vehicleMake || ukVehicleStatus?.make || "",
      vehicleModel: vehicleModel || ukVehicleStatus?.model || "",
      vehicleYear: inferredVehicleYear || vehicleYear || null,
      vehicleMileage,
      vehicleReg: vehicleRegDetected || vehicleReg || "",
    });
    const unifiedSold = lookupUnifiedSoldComps({
      category,
      query: baseQuery,
      region: requestedRegion,
      vehicle: {
        make: itemProfile?.vehicle?.make || vehicleMake || ukVehicleStatus?.make || "",
        model: itemProfile?.vehicle?.model || vehicleModel || ukVehicleStatus?.model || "",
        year: itemProfile?.vehicle?.year || inferredVehicleYear || vehicleYear || null,
        mileage: itemProfile?.vehicle?.mileage || vehicleMileage || null,
      },
    });
    if (unifiedSold?.summary) {
      soldCompsBenchmark = {
        ...(unifiedSold.context || {}),
        ...unifiedSold.summary,
      };
      const blended = blendEstimateWithSoldBenchmark({
        low,
        median: med,
        high,
        soldSummary: unifiedSold.summary,
        category,
      });
      low = blended.low;
      med = blended.median;
      high = blended.high;
      if (blended.applied) {
        confidenceReasonList.push(blended.reason);
      }
    }
    if (category === "vehicle") {
      const vehicleCal = applyVehicleMakeModelCalibration({
        low,
        median: med,
        high,
        make: itemProfile?.vehicle?.make || vehicleMake || ukVehicleStatus?.make || "",
        model: itemProfile?.vehicle?.model || vehicleModel || ukVehicleStatus?.model || "",
        region: requestedRegion,
        year: itemProfile?.vehicle?.year || inferredVehicleYear || vehicleYear || null,
        mileage: itemProfile?.vehicle?.mileage || vehicleMileage || null,
        query: baseQuery,
        soldCompsBenchmark,
      });
      if (vehicleCal.applied) {
        low = vehicleCal.low;
        med = vehicleCal.median;
        high = vehicleCal.high;
        confidenceReasonList.push(vehicleCal.reason);
      }
    }
    if (category === "vehicle" && soldCompsBenchmark && Number.isFinite(inferredVehicleYear) && Number.isFinite(med) && med > 0) {
      const ageYears = Math.max(0, new Date().getFullYear() - Number(inferredVehicleYear));
      if (
        ageYears >= 14 &&
        Number.isFinite(Number(soldCompsBenchmark.low)) &&
        Number.isFinite(Number(soldCompsBenchmark.median))
      ) {
        const agedTarget = Number(soldCompsBenchmark.low) * 0.55 + Number(soldCompsBenchmark.median) * 0.45;
        const adjustedMedian = Math.min(med, agedTarget);
        if (Number.isFinite(adjustedMedian) && adjustedMedian > 0 && adjustedMedian < med) {
          const ageFactor = adjustedMedian / med;
          med = adjustedMedian;
          low = Number.isFinite(low) ? low * ageFactor : low;
          high = Number.isFinite(high) ? high * ageFactor : high;
          confidenceReasonList.push("older-vehicle age market adjustment applied");
        }
      }
    }

    if (category !== "vehicle" && soldCompsBenchmark) {
      const soldCount = Number(soldCompsBenchmark.count || 0);
      const soldSource = String(soldCompsBenchmark.source || "").toLowerCase();
      const soldMedian = Number(soldCompsBenchmark.median || 0);
      const soldLow = Number(soldCompsBenchmark.low || 0);
      const soldHigh = Number(soldCompsBenchmark.high || 0);
      const soldSpreadPct =
        Number.isFinite(soldMedian) && soldMedian > 0 && Number.isFinite(soldLow) && Number.isFinite(soldHigh)
          ? Math.max(0, (soldHigh - soldLow) / soldMedian)
          : 999;
      const manualSupport = soldSource === "manual" && soldCount >= 1;
      const marketSupport = soldCount >= 4 || (soldCount >= 3 && soldSpreadPct <= 0.65);
      if (manualSupport || marketSupport) {
        const targetGateStatus = soldCount >= 4 ? "pass" : "caution";
        const targetGateScore = soldCount >= 4 ? 72 : 60;
        gate = {
          ...gate,
          status: gate.status === "hold" ? targetGateStatus : gate.status,
          score: Math.max(Number(gate.score || 0), targetGateScore),
          reasons: unique([...(gate.reasons || []), "sold benchmark support applied"]),
        };
        const minConfidence = soldCount >= 4 ? 62 : 52;
        if (Number(confidence.score || 0) < minConfidence) {
          confidence = {
            score: minConfidence,
            label: confidenceLabelFromScore(minConfidence),
          };
        }
        confidenceReasonList.push("sold benchmark added stability for low-liquidity item");
      }
    }

    const collectibleFloor = applyCollectibleFloorGuard({
      query: baseQuery,
      category,
      region: requestedRegion,
      low,
      median: med,
      high,
    });
    if (collectibleFloor) {
      low = collectibleFloor.low;
      med = collectibleFloor.median;
      high = collectibleFloor.high;
      confidenceReasonList.push(collectibleFloor.reason);
    }

    const withhold = shouldWithholdValuation({
      gate,
      confidence,
      soldCompsBenchmark,
      category,
    });
    const normalizedBand = sanitizePriceBand({
      low,
      median: med,
      high,
      category,
    });
    const finalLow = normalizedBand.low;
    const finalMedian = normalizedBand.median;
    const finalHigh = normalizedBand.high;
    if (withhold.withhold) {
      confidenceReasonList.push(`low-trust estimate shown: ${withhold.reason}`);
    }

    const sellTime = estimateSellTime({
      category,
      confidenceLabel: confidence.label,
      condition,
      conditionTier,
    });
    const profit = buildProfitSummary({
      buyPrice,
      low: finalLow,
      median: finalMedian,
      high: finalHigh,
    });
    const listingAssistant = buildListingAssistant({
      query: baseQuery,
      category,
      condition,
      conditionTier,
      conditionNotes,
      median: finalMedian,
      low: finalLow,
      high: finalHigh,
      currencySymbol: MARKET_CONFIG[requestedRegion]?.symbol || market.symbol,
      confidence: confidence.label,
    });
    const recommendedRetail = estimateRecommendedRetailPrice({
      category,
      query: baseQuery,
      resaleMedian: finalMedian,
      resaleLow: finalLow,
      resaleHigh: finalHigh,
      conditionTier,
      condition,
      vehicleYear,
      currencySymbol: MARKET_CONFIG[requestedRegion]?.symbol || market.symbol,
    });

    let finalStatus = gate.status === "hold" || withhold.withhold ? "needs_details" : "usable";
    if (BETA_STRICT_MODE && category === "vehicle") {
      const soldMedian = Number(soldCompsBenchmark?.median || 0);
      const soldGap = Number.isFinite(soldMedian) && soldMedian > 0 && Number.isFinite(med)
        ? Math.abs(Number(med) - soldMedian) / soldMedian
        : 0;
      const strictHold =
        confidence.score < 70 ||
        gate.status !== "pass" ||
        sourceCount < 2 ||
        soldGap > 0.35;
      if (strictHold) {
        finalStatus = "needs_details";
        confidenceReasonList.push("beta strict mode: review details before acting");
      }
    }

    const accuracyBlockers = [];
    if (gate.status !== "pass") accuracyBlockers.push("quality gate not passed");
    if (Number(confidence.score || 0) < 70) accuracyBlockers.push("confidence below target");
      const auxSoldSupport =
        Number(soldCompsBenchmark?.count || 0) >= (category === "vehicle" ? 4 : 2);
      if (sourceCount < 2 && !auxSoldSupport) accuracyBlockers.push("not enough independent sources");
      if (consensus.lowConsensus) accuracyBlockers.push("cross-source price disagreement");
    if (category === "vehicle") {
      if (!ukVehicleStatus?.ok) accuracyBlockers.push("vehicle identity not fully verified");
      if (Number(soldCompsBenchmark?.count || 0) < 4) accuracyBlockers.push("limited vehicle sold comps");
    }
    const accuracyScore = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          Number(gate?.score || 0) * 0.45 +
            Number(confidence?.score || 0) * 0.35 +
            Math.min(20, Number(sourceCount || 0) * 10)
        )
      )
    );
    const accuracyReady = accuracyScore >= 75 && accuracyBlockers.length === 0;

    let pricingPayload = {
      ok: true,
      finalStatus,
      query: baseQuery,
      category,
      region: requestedRegion,
      currency,
      currencySymbol: MARKET_CONFIG[requestedRegion]?.symbol || market.symbol,
      low: finalLow,
      median: finalMedian,
      high: finalHigh,
      recommendedRetail,
      confidence,
      confidenceReasons: confidenceReasonList,
      qualityGate: gate,
      accuracy: {
        ready: accuracyReady,
        score: accuracyScore,
        blockers: accuracyBlockers,
      },
      conditionTier,
      valuationAdjustments: [tierAdj.label],
      calibrationFactor: calibrated.factor,
      sellTime,
      profit,
      listingAssistant,
      autoDetectedQuery: !manualItemQuery ? baseQuery : null,
      detectionConfidence: autoDetection?.detectionConfidence || null,
      stage,
      refineRecommended: isFastStage,
      fingerprint,
      memoryAdjustment: memoryAdjusted.prior
        ? {
            priorSamples: memoryAdjusted.prior.samples,
            priorMedian: memoryAdjusted.prior.median,
            factor: memoryAdjusted.adjustmentFactor,
          }
        : null,
      vehicleStatus: ukVehicleStatus,
      vehicleStatusError: ukVehicleStatusError,
      vehicleRegDetected,
      soldCompsBenchmark,
      itemProfile,
      liveDataAt: new Date().toISOString(),
      vehicleAdjustments,
      recommendations: recommendMarketplaces({
        category,
        region: requestedRegion,
        confidenceLabel: confidence.label,
        condition,
      }),
      fromCache: false,
      comps: filteredComps
        .sort((a, b) => b.matchScore - a.matchScore)
        .map(({ title, price, source, link }) => ({ title, price, source, link })),
    };

    const strictAccuracyHold =
      ACCURACY_STRICT_MODE &&
      (withhold.withhold || gate.status === "hold" || Number(confidence.score || 0) < 55);
    if (strictAccuracyHold) {
      pricingPayload = applyAccuracyHold(
        pricingPayload,
        withhold.reason || "confidence below accuracy threshold",
        category
      );
    }

    if (!bypassCache) {
      saveCachedPricing(ckey, pricingPayload);
    }
    const shouldUpdatePrior =
      String(pricingPayload?.finalStatus || "") === "usable" &&
      Number(pricingPayload?.confidence?.score || 0) >= 60 &&
      String(pricingPayload?.qualityGate?.status || "") !== "hold" &&
      Number.isFinite(Number(pricingPayload?.median || 0)) &&
      Number(pricingPayload?.median || 0) > 0;
    if (shouldUpdatePrior) {
      updateMemoryPrior({
        category,
        region: requestedRegion,
        fingerprintKey: fingerprint.key,
        median: Number(pricingPayload.median),
      });
    }

    return res.json({
      labels,
      pricing: pricingPayload,
    });
  } catch (err) {
    const errorMessage = String(err?.message || err || "Analyze failed");
    console.error("[/analyze] error:", errorMessage);
    return res.status(500).json({
      ok: false,
      error: errorMessage,
      pricing: {
        ok: false,
        error: errorMessage,
      },
    });
  }
});

// Backward-compatible alias used by older local scripts/tests.
app.post("/analyze-text", upload.single("image"), async (req, res) => {
  req.url = "/analyze";
  return app._router.handle(req, res, () => {});
});

// --- Marketplace API v1 (hardened foundation) ---
const MARKETPLACE_API_PREFIX = "/api/v1";
const MARKETPLACE_DATA_FILE = String(process.env.MARKETPLACE_DATA_FILE || "./marketplace-data.json");
const AUTH_HEADER_PREFIX = "Bearer ";
const RATE_LIMIT_WINDOW_MS = Math.max(1000, Number(process.env.MARKETPLACE_RATE_LIMIT_WINDOW_MS || 60_000));
const RATE_LIMIT_MAX_REQUESTS = Math.max(20, Number(process.env.MARKETPLACE_RATE_LIMIT_MAX_REQUESTS || 120));
const CHECKOUT_IDEMPOTENCY_TTL_MS = Math.max(60_000, Number(process.env.CHECKOUT_IDEMPOTENCY_TTL_MS || 15 * 60_000));
const USERS = new Map();
const TOKENS = new Map();
const LISTINGS = new Map();
const CARTS = new Map();
const ORDERS = new Map();
const RATE_LIMIT_STATE = new Map();
const CHECKOUT_IDEMPOTENCY = new Map();
const MARKETPLACE_CATEGORIES = [
  "vehicles",
  "electronics",
  "fashion",
  "collectibles",
  "home",
  "tools",
  "sports",
  "other",
];
let marketplaceStateLoaded = false;
let persistMarketplaceTimer = null;

function marketplaceId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function marketplaceNow() {
  return new Date().toISOString();
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(String(password || ""), salt, 150000, 32, "sha256").toString("hex");
}

function createPasswordRecord(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = hashPassword(password, salt);
  return { salt, hash, algorithm: "pbkdf2_sha256_150k" };
}

function verifyPassword(password, record) {
  if (!record || !record.salt || !record.hash) return false;
  const computed = hashPassword(password, record.salt);
  return crypto.timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(record.hash, "hex"));
}

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
  };
}

function parsePositiveNumber(raw) {
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function parsePositiveInteger(raw, fallback) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

function listingView(listing) {
  return {
    id: listing.id,
    sellerId: listing.sellerId,
    title: listing.title,
    description: listing.description,
    category: listing.category,
    condition: listing.condition,
    price: listing.price,
    currency: listing.currency,
    quantity: listing.quantity,
    imageUrls: listing.imageUrls,
    shipping: listing.shipping,
    location: listing.location,
    createdAt: listing.createdAt,
    updatedAt: listing.updatedAt,
  };
}

function persistMarketplaceStateSync() {
  try {
    const snapshot = {
      users: Array.from(USERS.values()),
      tokens: Array.from(TOKENS.entries()),
      listings: Array.from(LISTINGS.values()),
      carts: Array.from(CARTS.values()),
      orders: Array.from(ORDERS.values()),
      savedAt: marketplaceNow(),
    };
    fs.writeFileSync(MARKETPLACE_DATA_FILE, JSON.stringify(snapshot, null, 2), "utf8");
  } catch (err) {
    console.error(`[marketplace] Failed to persist state: ${String(err?.message || err)}`);
  }
}

function persistMarketplaceStateSoon() {
  if (persistMarketplaceTimer) return;
  persistMarketplaceTimer = setTimeout(() => {
    persistMarketplaceTimer = null;
    persistMarketplaceStateSync();
  }, 150);
}

function loadMarketplaceState() {
  if (marketplaceStateLoaded) return;
  marketplaceStateLoaded = true;
  try {
    if (!fs.existsSync(MARKETPLACE_DATA_FILE)) return;
    const parsed = JSON.parse(fs.readFileSync(MARKETPLACE_DATA_FILE, "utf8"));
    for (const user of parsed.users || []) {
      if (user?.id) USERS.set(user.id, user);
    }
    for (const [token, userId] of parsed.tokens || []) {
      if (token && userId) TOKENS.set(token, userId);
    }
    for (const listing of parsed.listings || []) {
      if (listing?.id) LISTINGS.set(listing.id, listing);
    }
    for (const cart of parsed.carts || []) {
      if (cart?.userId) CARTS.set(cart.userId, cart);
    }
    for (const order of parsed.orders || []) {
      if (order?.id) ORDERS.set(order.id, order);
    }
  } catch (err) {
    console.error(`[marketplace] Failed to load state: ${String(err?.message || err)}`);
  }
}

loadMarketplaceState();

function parseAuthToken(req) {
  const raw = String(req.headers.authorization || "");
  if (!raw.startsWith(AUTH_HEADER_PREFIX)) return null;
  return raw.slice(AUTH_HEADER_PREFIX.length).trim();
}

function requireAuth(req, res, next) {
  const token = parseAuthToken(req);
  if (!token) {
    return res.status(401).json({ ok: false, error: "Missing bearer token." });
  }
  const userId = TOKENS.get(token);
  if (!userId || !USERS.has(userId)) {
    return res.status(401).json({ ok: false, error: "Invalid or expired token." });
  }
  req.auth = { token, userId, user: USERS.get(userId) };
  return next();
}

function marketplaceRateLimit(req, res, next) {
  const key = `${String(req.ip || "unknown")}:${req.path}`;
  const now = Date.now();
  const item = RATE_LIMIT_STATE.get(key);
  if (!item || now >= item.resetAt) {
    RATE_LIMIT_STATE.set(key, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    res.setHeader("X-RateLimit-Limit", String(RATE_LIMIT_MAX_REQUESTS));
    res.setHeader("X-RateLimit-Remaining", String(RATE_LIMIT_MAX_REQUESTS - 1));
    return next();
  }

  item.count += 1;
  const remaining = Math.max(0, RATE_LIMIT_MAX_REQUESTS - item.count);
  res.setHeader("X-RateLimit-Limit", String(RATE_LIMIT_MAX_REQUESTS));
  res.setHeader("X-RateLimit-Remaining", String(remaining));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(item.resetAt / 1000)));
  if (item.count > RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({ ok: false, error: "Too many requests. Please retry shortly." });
  }
  return next();
}

function getOrCreateCart(userId) {
  if (!CARTS.has(userId)) {
    CARTS.set(userId, {
      userId,
      items: [],
      updatedAt: marketplaceNow(),
    });
  }
  return CARTS.get(userId);
}

function cartView(cart) {
  let subtotal = 0;
  const items = cart.items
    .map((item) => {
      const listing = LISTINGS.get(item.listingId);
      if (!listing) return null;
      const qty = Math.max(1, Number(item.quantity || 1));
      const lineTotal = Number((listing.price * qty).toFixed(2));
      subtotal += lineTotal;
      return {
        listingId: listing.id,
        sellerId: listing.sellerId,
        title: listing.title,
        price: listing.price,
        currency: listing.currency,
        quantity: qty,
        lineTotal,
      };
    })
    .filter(Boolean);

  return {
    userId: cart.userId,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: Number(subtotal.toFixed(2)),
    items,
    updatedAt: cart.updatedAt,
  };
}

function listingMatchesQuery(listing, filters) {
  if (filters.category && listing.category !== filters.category) return false;
  if (Number.isFinite(filters.minPrice) && listing.price < filters.minPrice) return false;
  if (Number.isFinite(filters.maxPrice) && listing.price > filters.maxPrice) return false;
  if (filters.search) {
    const haystack = `${listing.title} ${listing.description}`.toLowerCase();
    if (!haystack.includes(filters.search)) return false;
  }
  return true;
}

function clearExpiredIdempotencyEntries() {
  const now = Date.now();
  for (const [key, value] of CHECKOUT_IDEMPOTENCY.entries()) {
    if (now >= value.expiresAt) CHECKOUT_IDEMPOTENCY.delete(key);
  }
}

function loadCheckoutIdempotency(req, userId) {
  clearExpiredIdempotencyEntries();
  const raw = String(req.headers["x-idempotency-key"] || "").trim();
  if (!raw) return null;
  return CHECKOUT_IDEMPOTENCY.get(`${userId}:${raw}`) || null;
}

function saveCheckoutIdempotency(req, userId, responseBody) {
  const raw = String(req.headers["x-idempotency-key"] || "").trim();
  if (!raw) return;
  CHECKOUT_IDEMPOTENCY.set(`${userId}:${raw}`, {
    responseBody,
    expiresAt: Date.now() + CHECKOUT_IDEMPOTENCY_TTL_MS,
  });
}

app.use(MARKETPLACE_API_PREFIX, marketplaceRateLimit);

app.get(`${MARKETPLACE_API_PREFIX}`, (req, res) => {
  return res.json({
    ok: true,
    name: "ValueVision Marketplace API",
    version: "v1",
    endpoints: [
      "POST /api/v1/auth/register",
      "POST /api/v1/auth/login",
      "POST /api/v1/auth/logout",
      "GET /api/v1/auth/me",
      "GET /api/v1/categories",
      "POST /api/v1/listings",
      "GET /api/v1/listings",
      "GET /api/v1/listings/mine",
      "GET /api/v1/listings/:id",
      "PATCH /api/v1/listings/:id",
      "DELETE /api/v1/listings/:id",
      "POST /api/v1/cart/items",
      "GET /api/v1/cart",
      "DELETE /api/v1/cart/items/:listingId",
      "POST /api/v1/orders/checkout",
      "GET /api/v1/orders/my",
      "GET /api/v1/sellers/me/dashboard",
    ],
  });
});

app.get(`${MARKETPLACE_API_PREFIX}/categories`, (req, res) => {
  return res.json({ ok: true, categories: MARKETPLACE_CATEGORIES });
});

app.post(`${MARKETPLACE_API_PREFIX}/auth/register`, (req, res) => {
  const name = String(req.body?.name || "").trim();
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");

  if (!name || !email || !password) {
    return res.status(400).json({ ok: false, error: "name, email, and password are required." });
  }
  if (password.length < 8) {
    return res.status(400).json({ ok: false, error: "Password must be at least 8 characters." });
  }

  for (const user of USERS.values()) {
    if (user.email === email) {
      return res.status(409).json({ ok: false, error: "Email already registered." });
    }
  }

  const user = {
    id: marketplaceId("usr"),
    name,
    email,
    password: createPasswordRecord(password),
    createdAt: marketplaceNow(),
  };
  USERS.set(user.id, user);

  const token = marketplaceId("tok");
  TOKENS.set(token, user.id);
  persistMarketplaceStateSoon();
  return res.status(201).json({ ok: true, token, user: sanitizeUser(user) });
});

app.post(`${MARKETPLACE_API_PREFIX}/auth/login`, (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");
  if (!email || !password) {
    return res.status(400).json({ ok: false, error: "email and password are required." });
  }
  const user = Array.from(USERS.values()).find((u) => u.email === email);
  if (!user || !verifyPassword(password, user.password)) {
    return res.status(401).json({ ok: false, error: "Invalid credentials." });
  }
  const token = marketplaceId("tok");
  TOKENS.set(token, user.id);
  persistMarketplaceStateSoon();
  return res.json({ ok: true, token, user: sanitizeUser(user) });
});

app.post(`${MARKETPLACE_API_PREFIX}/auth/logout`, requireAuth, (req, res) => {
  TOKENS.delete(req.auth.token);
  persistMarketplaceStateSoon();
  return res.json({ ok: true });
});

app.get(`${MARKETPLACE_API_PREFIX}/auth/me`, requireAuth, (req, res) => {
  return res.json({ ok: true, user: sanitizeUser(req.auth.user) });
});

app.post(`${MARKETPLACE_API_PREFIX}/listings`, requireAuth, (req, res) => {
  const title = String(req.body?.title || "").trim();
  const description = String(req.body?.description || "").trim();
  const category = String(req.body?.category || "").trim().toLowerCase();
  const condition = String(req.body?.condition || "used").trim().toLowerCase();
  const price = Number(req.body?.price);
  const currency = String(req.body?.currency || "USD").trim().toUpperCase();
  const quantity = parsePositiveInteger(req.body?.quantity || 1, 1);
  const imageUrls = Array.isArray(req.body?.imageUrls)
    ? req.body.imageUrls.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  const shipping = {
    type: String(req.body?.shipping?.type || "flat").trim().toLowerCase(),
    cost: Math.max(0, Number(req.body?.shipping?.cost || 0)),
  };
  const location = String(req.body?.location || "").trim();

  if (!title || !description || !category || !Number.isFinite(price) || price <= 0) {
    return res.status(400).json({
      ok: false,
      error: "title, description, category, and positive price are required.",
    });
  }
  if (!MARKETPLACE_CATEGORIES.includes(category)) {
    return res.status(400).json({ ok: false, error: `Invalid category. Use one of: ${MARKETPLACE_CATEGORIES.join(", ")}` });
  }

  const listing = {
    id: marketplaceId("lst"),
    sellerId: req.auth.userId,
    title,
    description,
    category,
    condition,
    price: Number(price.toFixed(2)),
    currency,
    quantity,
    imageUrls,
    shipping: {
      type: shipping.type,
      cost: Number(shipping.cost.toFixed(2)),
    },
    location,
    createdAt: marketplaceNow(),
    updatedAt: marketplaceNow(),
  };

  LISTINGS.set(listing.id, listing);
  persistMarketplaceStateSoon();
  return res.status(201).json({ ok: true, listing: listingView(listing) });
});

app.get(`${MARKETPLACE_API_PREFIX}/listings`, (req, res) => {
  const search = String(req.query?.search || "").trim().toLowerCase();
  const category = String(req.query?.category || "").trim().toLowerCase();
  const minPrice = parsePositiveNumber(req.query?.minPrice);
  const maxPrice = parsePositiveNumber(req.query?.maxPrice);
  const sort = String(req.query?.sort || "new").trim().toLowerCase();
  const page = parsePositiveInteger(req.query?.page || 1, 1);
  const limit = Math.min(50, parsePositiveInteger(req.query?.limit || 20, 20));

  if (category && !MARKETPLACE_CATEGORIES.includes(category)) {
    return res.status(400).json({ ok: false, error: "Invalid category filter." });
  }

  const filtered = Array.from(LISTINGS.values()).filter((listing) =>
    listingMatchesQuery(listing, { search, category, minPrice, maxPrice })
  );

  if (sort === "price_asc") {
    filtered.sort((a, b) => a.price - b.price);
  } else if (sort === "price_desc") {
    filtered.sort((a, b) => b.price - a.price);
  } else if (sort === "oldest") {
    filtered.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  } else {
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  const start = (page - 1) * limit;
  const end = start + limit;
  const items = filtered.slice(start, end).map((listing) => listingView(listing));
  return res.json({
    ok: true,
    page,
    limit,
    total: filtered.length,
    totalPages: Math.max(1, Math.ceil(filtered.length / limit)),
    listings: items,
  });
});

app.get(`${MARKETPLACE_API_PREFIX}/listings/mine`, requireAuth, (req, res) => {
  const mine = Array.from(LISTINGS.values())
    .filter((listing) => listing.sellerId === req.auth.userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((listing) => listingView(listing));
  return res.json({ ok: true, listings: mine });
});

app.get(`${MARKETPLACE_API_PREFIX}/listings/:id`, (req, res) => {
  const listing = LISTINGS.get(String(req.params.id || ""));
  if (!listing) return res.status(404).json({ ok: false, error: "Listing not found." });
  return res.json({ ok: true, listing: listingView(listing) });
});

app.patch(`${MARKETPLACE_API_PREFIX}/listings/:id`, requireAuth, (req, res) => {
  const id = String(req.params.id || "");
  const listing = LISTINGS.get(id);
  if (!listing) return res.status(404).json({ ok: false, error: "Listing not found." });
  if (listing.sellerId !== req.auth.userId) {
    return res.status(403).json({ ok: false, error: "Only the seller can update this listing." });
  }

  if (typeof req.body?.title === "string") listing.title = req.body.title.trim() || listing.title;
  if (typeof req.body?.description === "string") listing.description = req.body.description.trim() || listing.description;
  if (typeof req.body?.category === "string") {
    const nextCategory = req.body.category.trim().toLowerCase();
    if (!MARKETPLACE_CATEGORIES.includes(nextCategory)) {
      return res.status(400).json({ ok: false, error: "Invalid category." });
    }
    listing.category = nextCategory;
  }
  if (typeof req.body?.condition === "string") listing.condition = req.body.condition.trim().toLowerCase() || listing.condition;
  if (req.body?.price !== undefined) {
    const nextPrice = Number(req.body.price);
    if (!Number.isFinite(nextPrice) || nextPrice <= 0) {
      return res.status(400).json({ ok: false, error: "price must be a positive number." });
    }
    listing.price = Number(nextPrice.toFixed(2));
  }
  if (req.body?.quantity !== undefined) {
    const nextQty = Number(req.body.quantity);
    if (!Number.isFinite(nextQty) || nextQty < 0) {
      return res.status(400).json({ ok: false, error: "quantity must be >= 0." });
    }
    listing.quantity = Math.floor(nextQty);
  }
  listing.updatedAt = marketplaceNow();

  LISTINGS.set(id, listing);
  persistMarketplaceStateSoon();
  return res.json({ ok: true, listing: listingView(listing) });
});

app.delete(`${MARKETPLACE_API_PREFIX}/listings/:id`, requireAuth, (req, res) => {
  const id = String(req.params.id || "");
  const listing = LISTINGS.get(id);
  if (!listing) return res.status(404).json({ ok: false, error: "Listing not found." });
  if (listing.sellerId !== req.auth.userId) {
    return res.status(403).json({ ok: false, error: "Only the seller can delete this listing." });
  }
  LISTINGS.delete(id);
  persistMarketplaceStateSoon();
  return res.json({ ok: true, deletedId: id });
});

app.get(`${MARKETPLACE_API_PREFIX}/cart`, requireAuth, (req, res) => {
  const cart = getOrCreateCart(req.auth.userId);
  return res.json({ ok: true, cart: cartView(cart) });
});

app.post(`${MARKETPLACE_API_PREFIX}/cart/items`, requireAuth, (req, res) => {
  const listingId = String(req.body?.listingId || "").trim();
  const quantity = parsePositiveInteger(req.body?.quantity || 1, 1);
  const listing = LISTINGS.get(listingId);
  if (!listing) return res.status(404).json({ ok: false, error: "Listing not found." });
  if (listing.quantity < quantity) {
    return res.status(400).json({ ok: false, error: "Not enough stock." });
  }
  const cart = getOrCreateCart(req.auth.userId);
  const existing = cart.items.find((item) => item.listingId === listingId);
  if (existing) {
    existing.quantity = Math.min(listing.quantity, existing.quantity + quantity);
  } else {
    cart.items.push({ listingId, quantity });
  }
  cart.updatedAt = marketplaceNow();
  CARTS.set(cart.userId, cart);
  persistMarketplaceStateSoon();
  return res.status(201).json({ ok: true, cart: cartView(cart) });
});

app.delete(`${MARKETPLACE_API_PREFIX}/cart/items/:listingId`, requireAuth, (req, res) => {
  const listingId = String(req.params.listingId || "");
  const cart = getOrCreateCart(req.auth.userId);
  cart.items = cart.items.filter((item) => item.listingId !== listingId);
  cart.updatedAt = marketplaceNow();
  CARTS.set(cart.userId, cart);
  persistMarketplaceStateSoon();
  return res.json({ ok: true, cart: cartView(cart) });
});

app.post(`${MARKETPLACE_API_PREFIX}/orders/checkout`, requireAuth, (req, res) => {
  const existing = loadCheckoutIdempotency(req, req.auth.userId);
  if (existing) {
    res.setHeader("X-Idempotent-Replay", "true");
    return res.status(201).json(existing.responseBody);
  }

  const cart = getOrCreateCart(req.auth.userId);
  const preview = cartView(cart);
  if (!preview.items.length) {
    return res.status(400).json({ ok: false, error: "Cart is empty." });
  }

  for (const item of preview.items) {
    const listing = LISTINGS.get(item.listingId);
    if (!listing || listing.quantity < item.quantity) {
      return res.status(400).json({ ok: false, error: `Insufficient stock for listing ${item.listingId}.` });
    }
  }

  for (const item of preview.items) {
    const listing = LISTINGS.get(item.listingId);
    listing.quantity -= item.quantity;
    listing.updatedAt = marketplaceNow();
    LISTINGS.set(listing.id, listing);
  }

  const order = {
    id: marketplaceId("ord"),
    buyerId: req.auth.userId,
    items: preview.items,
    subtotal: preview.subtotal,
    currency: preview.items[0]?.currency || "USD",
    status: "created",
    shippingAddress: String(req.body?.shippingAddress || "").trim(),
    createdAt: marketplaceNow(),
  };
  ORDERS.set(order.id, order);

  cart.items = [];
  cart.updatedAt = marketplaceNow();
  CARTS.set(cart.userId, cart);
  const responseBody = { ok: true, order };
  saveCheckoutIdempotency(req, req.auth.userId, responseBody);
  persistMarketplaceStateSoon();
  return res.status(201).json(responseBody);
});

app.get(`${MARKETPLACE_API_PREFIX}/orders/my`, requireAuth, (req, res) => {
  const orders = Array.from(ORDERS.values())
    .filter((order) => order.buyerId === req.auth.userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return res.json({ ok: true, orders });
});

app.get(`${MARKETPLACE_API_PREFIX}/sellers/me/dashboard`, requireAuth, (req, res) => {
  const sellerListings = Array.from(LISTINGS.values()).filter((listing) => listing.sellerId === req.auth.userId);
  const listingIds = new Set(sellerListings.map((listing) => listing.id));
  let grossSales = 0;
  let soldUnits = 0;
  let activeInventoryValue = 0;
  let orderCount = 0;
  let weeklyGrossSales = 0;
  let weeklySoldUnits = 0;
  let weeklyOrderCount = 0;
  const nowMs = Date.now();
  const weekAgoMs = nowMs - 7 * 24 * 60 * 60 * 1000;
  for (const listing of sellerListings) {
    activeInventoryValue += listing.price * listing.quantity;
  }

  for (const order of ORDERS.values()) {
    let orderHasSellerItem = false;
    let orderWeeklyTotal = 0;
    let orderWeeklyUnits = 0;
    for (const item of order.items || []) {
      if (!listingIds.has(item.listingId)) continue;
      orderHasSellerItem = true;
      soldUnits += Number(item.quantity || 0);
      grossSales += Number(item.lineTotal || 0);
      orderWeeklyTotal += Number(item.lineTotal || 0);
      orderWeeklyUnits += Number(item.quantity || 0);
    }
    if (orderHasSellerItem) {
      orderCount += 1;
      const createdMs = new Date(order.createdAt || 0).getTime();
      if (Number.isFinite(createdMs) && createdMs >= weekAgoMs) {
        weeklyOrderCount += 1;
        weeklyGrossSales += orderWeeklyTotal;
        weeklySoldUnits += orderWeeklyUnits;
      }
    }
  }
  const avgOrderValue = orderCount ? grossSales / orderCount : 0;
  const weeklyAvgOrderValue = weeklyOrderCount ? weeklyGrossSales / weeklyOrderCount : 0;

  return res.json({
    ok: true,
    dashboard: {
      listingsActive: sellerListings.filter((listing) => listing.quantity > 0).length,
      listingsTotal: sellerListings.length,
      soldUnits,
      grossSales: Number(grossSales.toFixed(2)),
      orderCount,
      avgOrderValue: Number(avgOrderValue.toFixed(2)),
      activeInventoryValue: Number(activeInventoryValue.toFixed(2)),
      weekly: {
        windowDays: 7,
        soldUnits: weeklySoldUnits,
        grossSales: Number(weeklyGrossSales.toFixed(2)),
        orderCount: weeklyOrderCount,
        avgOrderValue: Number(weeklyAvgOrderValue.toFixed(2)),
      },
      currency: sellerListings[0]?.currency || "USD",
      updatedAt: marketplaceNow(),
    },
    providerUsage: usage,
    checkcarBudgetPolicy: {
      skipEnrichmentAtSoftLimit: CHECKCAR_SKIP_ENRICH_AT_SOFT_LIMIT,
      enforceHardLimit: CHECKCAR_ENFORCE_HARD_LIMIT,
    },
  });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
});

function shutdown(signal) {
  console.log(`[${new Date().toISOString()}] ${signal} received; shutting down backend...`);
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
