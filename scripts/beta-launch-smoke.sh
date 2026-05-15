#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/abbiemaytum/ValueVision"
API_BASE="${API_BASE:-http://127.0.0.1:5050}"

echo "[beta-smoke] API base: ${API_BASE}"
echo "[beta-smoke] health"
curl -fsS "${API_BASE}/health" | sed 's/^/[health] /'

echo "[beta-smoke] readiness"
curl -fsS "${API_BASE}/launch-readiness" | sed 's/^/[readiness] /'

echo "[beta-smoke] 3 sample scans"
node - <<'NODE'
const fs = require('fs');
const base = process.env.API_BASE || 'http://127.0.0.1:5050';
const rows = fs.readFileSync('/Users/abbiemaytum/ValueVision/backend/data/car-sold-comps.jsonl','utf8')
  .trim().split('\n').map((l)=>{ try { return JSON.parse(l); } catch { return null; }})
  .filter(Boolean);
const picks = [rows[0], rows[Math.floor(rows.length*0.2)], rows[Math.floor(rows.length*0.6)]].filter(Boolean);
(async()=>{
  for (const r of picks) {
    const body = {
      itemQuery: `${r.year||''} ${r.make||''} ${r.model||''} ${r.variant||''}`.trim(),
      category: 'vehicle',
      region: r.region || 'au',
      condition: 'used',
      conditionTier: 'good',
      vehicleYear: r.year || null,
      vehicleMileage: r.odometerKm || null,
      vehicleMake: r.make || '',
      vehicleModel: r.model || '',
    };
    const t0 = Date.now();
    const resp = await fetch(`${base}/analyze`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await resp.json();
    const ms = Date.now() - t0;
    console.log(JSON.stringify({
      query: body.itemQuery,
      ms,
      http: resp.status,
      finalStatus: j?.pricing?.finalStatus || null,
      confidence: j?.pricing?.confidence?.score ?? null,
      provisional: Boolean(j?.pricing?.provisional),
    }));
  }
})();
NODE

echo "[beta-smoke] done"
