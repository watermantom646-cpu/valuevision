#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const BASE_URL = String(process.env.BENCHMARK_BASE_URL || "http://127.0.0.1:5050");
const SOURCE_FILE = path.resolve(__dirname, "..", "data", "uk-plate-benchmark.json");
const TARGET_CORE_RATE = Number(process.env.PLATE_TARGET_CORE_RATE || 0.9);
const TARGET_PASS_RATE = Number(process.env.PLATE_TARGET_PASS_RATE || 0.9);
const TARGET_READY_RATE = Number(process.env.PLATE_TARGET_READY_RATE || 0.6);
const PAID_ACCESS_TOKEN = String(process.env.PAID_ACCESS_TOKEN || "").trim();
const PAID_ACCESS_HEADER = String(process.env.PAID_ACCESS_HEADER || "x-valuevision-paid-token").trim();

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

async function postJson(url, body) {
  const headers = { "content-type": "application/json" };
  if (PAID_ACCESS_TOKEN && PAID_ACCESS_HEADER) {
    headers[PAID_ACCESS_HEADER] = PAID_ACCESS_TOKEN;
  }
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // parse-safe
  }
  return { response, json, text };
}

function loadCases() {
  if (!fs.existsSync(SOURCE_FILE)) {
    throw new Error(`Missing dataset: ${SOURCE_FILE}`);
  }
  const raw = fs.readFileSync(SOURCE_FILE, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.length) {
    throw new Error("Benchmark dataset is empty.");
  }
  return parsed;
}

async function runCase(testCase) {
  const reg = String(testCase.registrationNumber || "").toUpperCase().trim();
  if (!reg) return { reg, ok: false, reason: "missing_registration" };

  const statusRes = await postJson(`${BASE_URL}/uk-vehicle-status`, {
    registrationNumber: reg,
  });
  const statusOk = Boolean(statusRes.response.ok && statusRes.json?.ok);

  const analyzeRes = await postJson(`${BASE_URL}/analyze`, {
    category: "vehicle",
    region: "uk",
    vehicleReg: reg,
    condition: "used",
    conditionTier: "good",
  });
  const pricing = analyzeRes.json?.pricing || {};
  const analyzeOk = Boolean(analyzeRes.response.ok && pricing.ok);
  const finalStatus = String(pricing.finalStatus || "");
  const accuracyReady = Boolean(pricing.accuracy?.ready);
  const accuracyScore = Number(pricing.accuracy?.score || 0);
  const make = normalize(statusRes.json?.make || pricing.vehicleStatus?.make || "");
  const expectedMake = normalize(testCase.expectedMakeContains || "");
  const makeCheck = expectedMake ? make.includes(expectedMake) : true;

  const corePass = statusOk && analyzeOk && makeCheck;

  const pass =
    statusOk &&
    analyzeOk &&
    finalStatus !== "needs_details" &&
    accuracyReady &&
    makeCheck;

  return {
    reg,
    corePass,
    pass,
    statusOk,
    analyzeOk,
    finalStatus: finalStatus || null,
    accuracyReady,
    accuracyScore,
    detectedMake: make || null,
    expectedMake: expectedMake || null,
    makeCheck,
    reason: pricing.provisionalReason || pricing.error || null,
  };
}

async function main() {
  const cases = loadCases();
  const rows = [];
  for (const testCase of cases) {
    // eslint-disable-next-line no-await-in-loop
    rows.push(await runCase(testCase));
  }

  const total = rows.length;
  const corePassCount = rows.filter((r) => r.corePass).length;
  const passCount = rows.filter((r) => r.pass).length;
  const readyCount = rows.filter((r) => r.accuracyReady).length;
  const coreRate = total ? corePassCount / total : 0;
  const passRate = total ? passCount / total : 0;
  const readyRate = total ? readyCount / total : 0;

  const summary = {
    total,
    corePassCount,
    corePassRate: Number((coreRate * 100).toFixed(1)),
    passCount,
    passRate: Number((passRate * 100).toFixed(1)),
    readyCount,
    readyRate: Number((readyRate * 100).toFixed(1)),
    targets: {
      coreRatePct: Number((TARGET_CORE_RATE * 100).toFixed(1)),
      passRatePct: Number((TARGET_PASS_RATE * 100).toFixed(1)),
      readyRatePct: Number((TARGET_READY_RATE * 100).toFixed(1)),
    },
    gates: {
      coreRateMet: coreRate >= TARGET_CORE_RATE,
      passRateMet: passRate >= TARGET_PASS_RATE,
      readyRateMet: readyRate >= TARGET_READY_RATE,
    },
  };

  console.log(JSON.stringify({ summary, rows }, null, 2));

  if (!summary.gates.coreRateMet || !summary.gates.passRateMet || !summary.gates.readyRateMet) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`[benchmark-uk-plates] Failed: ${String(err?.message || err)}`);
  process.exit(1);
});
