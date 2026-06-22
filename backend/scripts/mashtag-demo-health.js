#!/usr/bin/env node
/* eslint-disable no-console */

const BASE_URL = String(process.env.MASHTAG_BASE_URL || "https://valuevision-4kj3.onrender.com").replace(/\/+$/, "");
const WEB_URL = String(process.env.MASHTAG_WEB_URL || "https://valuevision.expo.app").replace(/\/+$/, "");
const TIMEOUT_MS = Math.max(5000, Number(process.env.MASHTAG_TIMEOUT_MS || 45000));

const CASES = [
  {
    name: "iPad instant-price demo",
    body: {
      itemQuery: "Apple iPad 9th Generation 64GB Wi-Fi Space Grey",
      category: "auto",
      itemOnly: "1",
    },
    expect: {
      category: "electronics",
      finalStatus: "usable",
      medianMin: 120,
      medianMax: 260,
      listingAssistant: true,
    },
  },
  {
    name: "gold sovereign high-value collectible",
    body: {
      itemQuery: "Queen Victoria gold sovereign 1899 coin",
      category: "collectible",
      itemOnly: "1",
    },
    expect: {
      category: "collectible",
      finalStatus: "usable",
      medianMin: 500,
      medianMax: 1300,
      forbiddenComp: "UK One Pound Coin 1983",
    },
  },
  {
    name: "raw Pokemon card safety hold",
    body: {
      itemQuery: "Pokemon Charizard Base Set 4/102 holographic card ungraded",
      category: "collectible",
      itemOnly: "1",
    },
    expect: {
      category: "collectible",
      finalStatus: "needs_details",
      noMedian: true,
      listingAssistant: false,
      reasonIncludes: "trading card pricing needs",
    },
  },
  {
    name: "Anything Mode vehicle handoff",
    body: {
      itemQuery: "Ford Fiesta 2015 car",
      category: "auto",
      itemOnly: "1",
    },
    expect: {
      category: "vehicle",
      finalStatus: "needs_details",
      noMedian: true,
      listingAssistant: false,
      reasonIncludes: "Open Car Mode",
    },
  },
];

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(path) {
  const res = await fetchWithTimeout(`${BASE_URL}${path}`);
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${path} failed (${res.status}): ${text || "no body"}`);
  return json;
}

function fail(row, message) {
  return { ...row, ok: false, failure: message };
}

function checkPricing(row, pricing) {
  const expect = row.expect || {};
  const median = Number(pricing?.median || 0);
  const comps = Array.isArray(pricing?.comps) ? pricing.comps : [];
  const reason = String(pricing?.provisionalReason || "");

  if (expect.category && String(pricing?.category || "") !== expect.category) {
    return fail(row, `category expected ${expect.category}, got ${pricing?.category || "missing"}`);
  }
  if (expect.finalStatus && String(pricing?.finalStatus || "") !== expect.finalStatus) {
    return fail(row, `finalStatus expected ${expect.finalStatus}, got ${pricing?.finalStatus || "missing"}`);
  }
  if (expect.noMedian && Number.isFinite(median) && median > 0) {
    return fail(row, `median should be hidden, got ${median}`);
  }
  if (!expect.noMedian && Number.isFinite(Number(expect.medianMin)) && median < Number(expect.medianMin)) {
    return fail(row, `median below expected range: ${median}`);
  }
  if (!expect.noMedian && Number.isFinite(Number(expect.medianMax)) && median > Number(expect.medianMax)) {
    return fail(row, `median above expected range: ${median}`);
  }
  if (typeof expect.listingAssistant === "boolean" && Boolean(pricing?.listingAssistant) !== expect.listingAssistant) {
    return fail(row, `listingAssistant expected ${expect.listingAssistant}, got ${Boolean(pricing?.listingAssistant)}`);
  }
  if (expect.reasonIncludes && !reason.toLowerCase().includes(String(expect.reasonIncludes).toLowerCase())) {
    return fail(row, `reason missing "${expect.reasonIncludes}": ${reason || "missing"}`);
  }
  if (
    expect.forbiddenComp &&
    comps.some((comp) => String(comp?.title || "").toLowerCase().includes(String(expect.forbiddenComp).toLowerCase()))
  ) {
    return fail(row, `forbidden comp appeared: ${expect.forbiddenComp}`);
  }
  return { ...row, ok: true };
}

async function runAnalyzeCase(row) {
  const response = await fetchWithTimeout(`${BASE_URL}/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...row.body,
      region: "uk",
      condition: "used",
      conditionTier: "good",
    }),
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) return fail(row, `/analyze failed (${response.status}): ${text || "no body"}`);
  const pricing = json?.pricing || {};
  const checked = checkPricing(row, pricing);
  return {
    ...checked,
    actual: {
      category: pricing.category || null,
      finalStatus: pricing.finalStatus || null,
      median: Number.isFinite(Number(pricing.median)) && Number(pricing.median) > 0
        ? Number(pricing.median)
        : null,
      confidence: pricing.confidence || null,
      reason: pricing.provisionalReason || null,
    },
  };
}

async function checkWeb() {
  const response = await fetchWithTimeout(`${WEB_URL}?mashtag-health=${Date.now()}`);
  const html = await response.text();
  if (!response.ok) throw new Error(`web demo failed (${response.status})`);
  const asset = html.match(/_expo\/static\/js\/web\/entry-[^"]+\.js/)?.[0] || null;
  if (!asset) throw new Error("web demo did not include Expo web bundle");
  return { ok: true, asset };
}

async function main() {
  const [health, readiness, web] = await Promise.all([
    fetchJson("/health"),
    fetchJson("/launch-readiness"),
    checkWeb(),
  ]);
  const rows = [];
  for (const row of CASES) {
    // eslint-disable-next-line no-await-in-loop
    rows.push(await runAnalyzeCase(row));
  }

  const readyScore = Number(readiness?.readyScore || 0);
  const maxScore = Number(readiness?.maxScore || 0);
  const backendOk = Boolean(health?.ok);
  const readinessOk = Boolean(readiness?.ok) && readyScore === maxScore && maxScore > 0;
  const casesOk = rows.every((row) => row.ok);
  const ok = backendOk && readinessOk && Boolean(web?.ok) && casesOk;

  console.log(JSON.stringify({
    ok,
    baseUrl: BASE_URL,
    webUrl: WEB_URL,
    web,
    backend: { ok: backendOk, port: health?.port || null },
    readiness: { ok: Boolean(readiness?.ok), readyScore, maxScore, blockers: readiness?.blockers || [] },
    rows,
  }, null, 2));

  if (!ok) process.exit(1);
}

main().catch((err) => {
  console.error(`[mashtag-demo-health] ${String(err?.message || err)}`);
  process.exit(1);
});
