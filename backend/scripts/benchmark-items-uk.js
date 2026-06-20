#!/usr/bin/env node
/* eslint-disable no-console */
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const BASE_URL = String(process.env.BENCHMARK_BASE_URL || "http://127.0.0.1:5050");
const TARGET_RATE = Number(process.env.ITEM_TARGET_RATE || 0.9);
const PAID_ACCESS_TOKEN = String(process.env.PAID_ACCESS_TOKEN || "").trim();
const PAID_ACCESS_HEADER = String(process.env.PAID_ACCESS_HEADER || "x-valuevision-paid-token").trim();

const CASES = [
  { q: "Apple iPad 9th gen 64GB WiFi", c: "electronics", min: 120, max: 260 },
  { q: "Apple MacBook Air M1 256GB", c: "electronics", min: 350, max: 650 },
  { q: "Dell XPS 13 laptop i7 16GB 512GB", c: "electronics", min: 280, max: 700 },
  { q: "DeWalt DCD796 18V drill kit", c: "tools", min: 80, max: 190 },
  { q: "Makita DHP484 drill 18V", c: "tools", min: 70, max: 170 },
  { q: "Bosch cordless screwdriver 12V", c: "tools", min: 35, max: 120 },
  { q: "Levi's 501 jeans men's", c: "fashion", min: 10, max: 45 },
  { q: "Nike Air Max 90 trainers size 9", c: "fashion", min: 25, max: 90 },
  { q: "North Face puffer jacket mens medium", c: "fashion", min: 20, max: 110 },
  { q: "Old UK one pound coin 1983", c: "collectible", min: 1, max: 40 },
  {
    q: "Bank of England white five pound note 1950s",
    c: "collectible",
    expectedStatus: "needs_details",
    forbiddenComp: "UK One Pound Coin 1983",
  },
];

async function runCase(row) {
  const body = {
    itemQuery: row.q,
    category: row.c,
    region: "uk",
    condition: "used",
    conditionTier: "good",
  };
  const headers = { "content-type": "application/json" };
  if (PAID_ACCESS_TOKEN && PAID_ACCESS_HEADER) {
    headers[PAID_ACCESS_HEADER] = PAID_ACCESS_TOKEN;
  }
  const response = await fetch(`${BASE_URL}/analyze`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const json = await response.json();
  const pricing = json?.pricing || {};
  const median = Number(pricing.median || 0);
  const usable = String(pricing.finalStatus || "") === "usable";
  const inRange = Number.isFinite(median) && median >= row.min && median <= row.max;
  const statusMatches = row.expectedStatus
    ? String(pricing.finalStatus || "") === row.expectedStatus
    : usable;
  const hasForbiddenComp = row.forbiddenComp
    ? (pricing.comps || []).some((comp) =>
        String(comp?.title || "").toLowerCase().includes(String(row.forbiddenComp).toLowerCase())
      )
    : false;
  const safe = row.expectedStatus ? statusMatches && !hasForbiddenComp : usable && inRange;

  return {
    query: row.q,
    category: row.c,
    finalStatus: pricing.finalStatus || null,
    median: Number.isFinite(median) ? Number(median.toFixed(2)) : null,
    confidenceLabel: pricing?.confidence?.label || null,
    accuracyReady: Boolean(pricing?.accuracy?.ready),
    usable,
    inRange,
    statusMatches,
    hasForbiddenComp,
    safe,
  };
}

async function main() {
  const rows = [];
  for (const row of CASES) {
    // eslint-disable-next-line no-await-in-loop
    rows.push(await runCase(row));
  }

  const total = rows.length;
  const usableCount = rows.filter((r) => r.usable).length;
  const inRangeCount = rows.filter((r) => r.inRange).length;
  const usableInRangeCount = rows.filter((r) => r.usable && r.inRange).length;
  const safeCount = rows.filter((r) => r.safe).length;
  const safeRate = total ? safeCount / total : 0;
  const requiredCasesMet = rows
    .filter((row) => row.query && CASES.find((item) => item.q === row.query)?.expectedStatus)
    .every((row) => row.safe);
  const summary = {
    total,
    usableCount,
    usableRatePct: Number(((usableCount / total) * 100).toFixed(1)),
    inRangeCount,
    inRangeRatePct: Number(((inRangeCount / total) * 100).toFixed(1)),
    usableInRangeCount,
    safeCount,
    safeRatePct: Number((safeRate * 100).toFixed(1)),
    requiredCasesMet,
    targetRatePct: Number((TARGET_RATE * 100).toFixed(1)),
    gateMet: safeRate >= TARGET_RATE && requiredCasesMet,
  };

  console.log(JSON.stringify({ summary, rows }, null, 2));
  if (!summary.gateMet) process.exit(1);
}

main().catch((err) => {
  console.error(`[benchmark-items-uk] Failed: ${String(err?.message || err)}`);
  process.exit(1);
});
