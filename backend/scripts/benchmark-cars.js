#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

const SOURCE_FILE = path.resolve(__dirname, "..", "data", "car-sold-comps.jsonl");
const BASE_URL = String(process.env.BENCHMARK_BASE_URL || "http://127.0.0.1:5050");
const SAMPLE_SIZE = Math.max(20, Number(process.env.BENCHMARK_SAMPLE_SIZE || 80));

function pickRows(lines, size) {
  const filtered = lines
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter((x) => x.make && x.model && Number.isFinite(Number(x.price)) && Number(x.price) > 0);
  const shuffled = filtered.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(size, shuffled.length));
}

async function run() {
  if (!fs.existsSync(SOURCE_FILE)) {
    throw new Error(`Missing dataset: ${SOURCE_FILE}`);
  }
  const lines = fs.readFileSync(SOURCE_FILE, "utf8").split("\n").filter(Boolean);
  const rows = pickRows(lines, SAMPLE_SIZE);
  console.log(`[benchmark-cars] Running ${rows.length} samples against ${BASE_URL}/analyze`);

  let mape = 0;
  let count = 0;
  const worst = [];
  for (const row of rows) {
    const body = {
      itemQuery: `${row.year || ""} ${row.make} ${row.model} ${row.variant || ""}`.trim(),
      category: "vehicle",
      region: row.region || "au",
      condition: "used",
      conditionTier: "good",
      vehicleYear: row.year || null,
      vehicleMileage: row.odometerKm || null,
      vehicleMake: row.make,
      vehicleModel: row.model,
    };
    const resp = await fetch(`${BASE_URL}/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await resp.json();
    const predicted = Number(json?.pricing?.median || 0);
    const expected = Number(row.price);
    if (!Number.isFinite(predicted) || predicted <= 0) continue;
    const absPct = Math.abs(predicted - expected) / expected * 100;
    mape += absPct;
    count += 1;
    worst.push({
      query: body.itemQuery,
      expected,
      predicted: Number(predicted.toFixed(2)),
      absPct: Number(absPct.toFixed(2)),
    });
  }

  worst.sort((a, b) => b.absPct - a.absPct);
  console.log(JSON.stringify({
    sampleSize: rows.length,
    matched: count,
    mapePct: count ? Number((mape / count).toFixed(2)) : null,
    worst5: worst.slice(0, 5),
  }, null, 2));
}

run().catch((err) => {
  console.error(`[benchmark-cars] Failed: ${String(err?.message || err)}`);
  process.exit(1);
});
