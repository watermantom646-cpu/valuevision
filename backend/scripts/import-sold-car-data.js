#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

const SOURCE_URL = "https://soldcartracker.github.io/JSON_data/sold_cars.json";
const OUTPUT_DIR = path.resolve(__dirname, "..", "data");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "car-sold-comps.jsonl");
const MAX_ROWS = Number(process.env.CAR_SOLD_IMPORT_MAX_ROWS || 300000);

function normalizeText(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function parseOdometer(raw) {
  if (raw == null) return null;
  const cleaned = String(raw).replace(/,/g, "").trim();
  const num = Number(cleaned);
  return Number.isFinite(num) && num >= 0 ? Math.round(num) : null;
}

function parsePrice(raw) {
  const num = Number(raw);
  return Number.isFinite(num) && num > 0 ? Number(num.toFixed(2)) : null;
}

function parseYear(raw) {
  const num = Number(raw);
  return Number.isFinite(num) && num > 1900 && num < 2100 ? Math.floor(num) : null;
}

function pickMakeModel(obj) {
  const make = String(obj.make || "").trim();
  const model = String(obj.model || "").trim();
  if (!make || make === "?" || !model || model === "?") return null;
  return { make, model };
}

async function run() {
  console.log(`[import-sold-cars] Fetching ${SOURCE_URL}`);
  const resp = await fetch(SOURCE_URL);
  if (!resp.ok) {
    throw new Error(`Source fetch failed: HTTP ${resp.status}`);
  }
  const text = await resp.text();
  const lines = text.split("\n").map((x) => x.trim()).filter(Boolean);
  console.log(`[import-sold-cars] Read ${lines.length} raw rows`);

  const out = [];
  for (const line of lines) {
    if (out.length >= MAX_ROWS) break;
    let obj = null;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const mm = pickMakeModel(obj);
    if (!mm) continue;
    const price = parsePrice(obj.price);
    if (!price) continue;
    const year = parseYear(obj.year);
    const odometerKm = parseOdometer(obj["Indicated Odometer Reading"]);
    const soldAt = String(obj.date || "").trim() || null;

    out.push({
      source: "soldcartracker",
      region: "au",
      make: mm.make,
      model: mm.model,
      makeNorm: normalizeText(mm.make),
      modelNorm: normalizeText(mm.model),
      variant: String(obj.variant || "").trim() || null,
      year,
      price,
      currency: "AUD",
      location: String(obj.Location || "").trim() || null,
      odometerKm,
      bodyType: String(obj["Body Type"] || "").trim() || null,
      fuelType: String(obj["Fuel Type"] || "").trim() || null,
      transmission: String(obj.Transmission || "").trim() || null,
      soldAt,
      rawUrl: String(obj.url || "").trim() || null,
    });
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const payload = out.map((row) => JSON.stringify(row)).join("\n");
  fs.writeFileSync(OUTPUT_FILE, payload ? `${payload}\n` : "", "utf8");

  console.log(`[import-sold-cars] Wrote ${out.length} rows to ${OUTPUT_FILE}`);
  const prices = out.map((x) => x.price).sort((a, b) => a - b);
  const median = prices.length ? prices[Math.floor(prices.length / 2)] : 0;
  console.log(`[import-sold-cars] Price median: ${median} AUD`);
}

run().catch((err) => {
  console.error(`[import-sold-cars] Failed: ${String(err?.message || err)}`);
  process.exit(1);
});
