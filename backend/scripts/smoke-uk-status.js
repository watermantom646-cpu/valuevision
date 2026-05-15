#!/usr/bin/env node
/* eslint-disable no-console */

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:5050";
const PLATES = ["SW15VMZ", "SF53GUD", "OE05FSJ", "CE06CHD", "MV15CYO", "BG11GWX"];

async function getJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Keep null; caller handles parse failures.
  }
  return { response, json, text };
}

async function main() {
  let failed = 0;

  const health = await getJson(`${BASE_URL}/health`);
  if (!health.response.ok || !health.json?.ok) {
    console.error("[FAIL] health check failed", health.text || health.response.status);
    process.exit(1);
  }
  console.log(`[OK] health on port ${health.json.port}`);

  for (const plate of PLATES) {
    try {
      const result = await getJson(`${BASE_URL}/uk-vehicle-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationNumber: plate }),
      });
      const ok = Boolean(result.response.ok && result.json?.ok);
      if (!ok) {
        failed += 1;
        console.error(`[FAIL] ${plate}: ${result.json?.error || result.response.status}`);
        continue;
      }

      const mot = result.json?.motStatus || "unknown";
      const tax = result.json?.taxStatus || "unknown";
      const writeOff =
        result.json?.crashHistory?.hasWriteOffRecord || result.json?.historyCategories?.hasWriteOffRecord
          ? "yes"
          : "no";
      console.log(`[OK] ${plate}: MOT=${mot} | TAX=${tax} | WRITE_OFF=${writeOff}`);
    } catch (error) {
      failed += 1;
      console.error(`[FAIL] ${plate}: ${error?.message || String(error)}`);
    }
  }

  if (failed > 0) {
    console.error(`\nSmoke test failed for ${failed} plate(s).`);
    process.exit(1);
  }
  console.log("\nSmoke test passed.");
}

main().catch((error) => {
  console.error(error?.message || String(error));
  process.exit(1);
});
