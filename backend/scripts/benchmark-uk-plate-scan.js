#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

const BASE_URL = String(process.env.BENCHMARK_BASE_URL || "http://127.0.0.1:5050");
const SOURCE_FILE = path.resolve(
  __dirname,
  "..",
  "data",
  process.env.PLATE_SCAN_SOURCE_FILE || "uk-plate-scan-benchmark.json"
);
const TARGET_EXACT_RATE = Number(process.env.PLATE_SCAN_TARGET_EXACT_RATE || 0.9);
const TARGET_DETECTED_RATE = Number(process.env.PLATE_SCAN_TARGET_DETECTED_RATE || 0.97);
const LIMIT = Number(process.env.PLATE_SCAN_LIMIT || 0) || null;
const CONCURRENCY = Math.max(1, Number(process.env.PLATE_SCAN_CONCURRENCY || 4));
const PROGRESS_EVERY = Math.max(1, Number(process.env.PLATE_SCAN_PROGRESS_EVERY || 25));
const PROGRESS_FILE = String(process.env.PLATE_SCAN_PROGRESS_FILE || "").trim();

function normalizeReg(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function loadRows() {
  if (!fs.existsSync(SOURCE_FILE)) {
    throw new Error(`Missing scan dataset: ${SOURCE_FILE}`);
  }
  const parsed = JSON.parse(fs.readFileSync(SOURCE_FILE, "utf8"));
  if (!Array.isArray(parsed) || !parsed.length) {
    throw new Error("Scan dataset is empty.");
  }
  const rows = parsed
    .map((row) => ({
      registrationNumber: normalizeReg(row?.registrationNumber),
      imagePath: String(row?.imagePath || "").trim(),
    }))
    .filter((row) => row.registrationNumber && row.imagePath);
  if (!rows.length) {
    throw new Error("No valid rows (registrationNumber + imagePath) in dataset.");
  }
  return LIMIT ? rows.slice(0, LIMIT) : rows;
}

async function scanOne(row) {
  const absPath = path.isAbsolute(row.imagePath)
    ? row.imagePath
    : path.resolve(path.dirname(SOURCE_FILE), row.imagePath);
  if (!fs.existsSync(absPath)) {
    return {
      ok: false,
      expected: row.registrationNumber,
      imagePath: absPath,
      error: "image_missing",
    };
  }
  const buffer = fs.readFileSync(absPath);
  const body = new FormData();
  body.append("image", new Blob([buffer], { type: "image/png" }), path.basename(absPath));
  const response = await fetch(`${BASE_URL}/uk-plate-scan`, {
    method: "POST",
    body,
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    return {
      ok: false,
      expected: row.registrationNumber,
      imagePath: absPath,
      error: "non_json_response",
    };
  }
  if (!response.ok || !json?.ok) {
    return {
      ok: false,
      expected: row.registrationNumber,
      imagePath: absPath,
      error: String(json?.error || `http_${response.status}`),
    };
  }
  const expected = row.registrationNumber;
  const detected = normalizeReg(json?.registrationNumber || "");
  const candidates = Array.isArray(json?.candidates)
    ? json.candidates.map((c) => normalizeReg(c?.registrationNumber)).filter(Boolean)
    : [];
  const exact = detected && detected === expected;
  const top3 = exact || candidates.slice(0, 3).includes(expected);
  return {
    ok: true,
    expected,
    detected: detected || null,
    detectedAny: Boolean(detected),
    exact,
    top3,
    highConfidence: Boolean(json?.highConfidence),
    ambiguous: Boolean(json?.ambiguous),
    confidence: Number(json?.confidence || 0),
    imagePath: absPath,
  };
}

function writeProgressLine(line) {
  const msg = String(line || "");
  console.log(msg);
  if (PROGRESS_FILE) {
    try {
      fs.appendFileSync(PROGRESS_FILE, `${msg}\n`, "utf8");
    } catch {}
  }
}

function formatProgress({ completed, total, exactCount, detectedCount, errorCount, startedAt }) {
  const elapsedSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
  const ratePerSec = completed / elapsedSec;
  const remaining = Math.max(0, total - completed);
  const etaSec = ratePerSec > 0 ? Math.round(remaining / ratePerSec) : null;
  const exactRate = ((exactCount / Math.max(1, completed)) * 100).toFixed(2);
  const detectedRate = ((detectedCount / Math.max(1, completed)) * 100).toFixed(2);
  return `[plate-scan-progress] ${completed}/${total} exact=${exactRate}% detected=${detectedRate}% errors=${errorCount} elapsed=${elapsedSec}s${etaSec === null ? "" : ` eta=${etaSec}s`}`;
}

async function runWithConcurrency(rows) {
  const queue = rows.slice();
  const out = [];
  const stats = {
    total: rows.length,
    completed: 0,
    exactCount: 0,
    detectedCount: 0,
    errorCount: 0,
    startedAt: Date.now(),
  };
  if (PROGRESS_FILE) {
    try {
      fs.writeFileSync(PROGRESS_FILE, "", "utf8");
    } catch {}
  }
  writeProgressLine(`[plate-scan-progress] start total=${stats.total} concurrency=${CONCURRENCY}`);

  async function worker() {
    while (queue.length) {
      const next = queue.shift();
      let result;
      try {
        // eslint-disable-next-line no-await-in-loop
        result = await scanOne(next);
      } catch (err) {
        result = {
          ok: false,
          expected: normalizeReg(next?.registrationNumber),
          imagePath: String(next?.imagePath || ""),
          error: String(err?.message || err),
        };
      }
      out.push(result);
      stats.completed += 1;
      if (result.ok) {
        if (result.exact) stats.exactCount += 1;
        if (result.detectedAny) stats.detectedCount += 1;
      } else {
        stats.errorCount += 1;
      }
      if (stats.completed % PROGRESS_EVERY === 0 || stats.completed === stats.total) {
        writeProgressLine(formatProgress(stats));
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  writeProgressLine("[plate-scan-progress] done");
  return out;
}

function pct(numerator, denominator) {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

async function main() {
  const rows = loadRows();
  console.log(`[plate-scan] rows=${rows.length} source=${SOURCE_FILE}`);
  const results = await runWithConcurrency(rows);
  const total = results.length;
  const okRows = results.filter((r) => r.ok).length;
  const errors = results.filter((r) => !r.ok);
  const exactCount = results.filter((r) => r.ok && r.exact).length;
  const top3Count = results.filter((r) => r.ok && r.top3).length;
  const detectedCount = results.filter((r) => r.ok && r.detectedAny).length;
  const ambiguousCount = results.filter((r) => r.ok && r.ambiguous).length;
  const highConfidenceCount = results.filter((r) => r.ok && r.highConfidence).length;
  const avgConfidence = results.length
    ? Number(
        (
          results
            .filter((r) => r.ok)
            .reduce((sum, r) => sum + Number(r.confidence || 0), 0) / Math.max(1, okRows)
        ).toFixed(4)
      )
    : 0;

  const summary = {
    total,
    okRows,
    errorRows: errors.length,
    exactCount,
    exactRate: pct(exactCount, total),
    top3Count,
    top3Rate: pct(top3Count, total),
    detectedCount,
    detectedRate: pct(detectedCount, total),
    ambiguousCount,
    ambiguousRate: pct(ambiguousCount, total),
    highConfidenceCount,
    highConfidenceRate: pct(highConfidenceCount, total),
    avgConfidence,
    targets: {
      exactRatePct: Number((TARGET_EXACT_RATE * 100).toFixed(2)),
      detectedRatePct: Number((TARGET_DETECTED_RATE * 100).toFixed(2)),
    },
    gates: {
      exactRateMet: exactCount / Math.max(1, total) >= TARGET_EXACT_RATE,
      detectedRateMet: detectedCount / Math.max(1, total) >= TARGET_DETECTED_RATE,
    },
  };

  const misses = results
    .filter((r) => r.ok && !r.exact)
    .slice(0, 20)
    .map((r) => ({
      expected: r.expected,
      detected: r.detected,
      top3: r.top3,
      confidence: r.confidence,
      imagePath: r.imagePath,
    }));
  const errorPreview = errors.slice(0, 20);

  console.log(JSON.stringify({ summary, misses, errors: errorPreview }, null, 2));

  if (!summary.gates.exactRateMet || !summary.gates.detectedRateMet) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`[benchmark-uk-plate-scan] Failed: ${String(err?.message || err)}`);
  process.exit(1);
});
