#!/usr/bin/env node

const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const baseUrl = String(
  process.env.GROWTH_API_BASE ||
  process.env.PUBLIC_API_BASE ||
  "https://valuevision-4kj3.onrender.com"
).replace(/\/+$/, "");
const token = String(process.env.GROWTH_DASHBOARD_TOKEN || "").trim();

if (!token) {
  console.error("[growth] GROWTH_DASHBOARD_TOKEN is missing.");
  process.exit(1);
}

(async () => {
  const response = await fetch(`${baseUrl}/growth-metrics`, {
    headers: { "X-Growth-Dashboard-Token": token },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(String(payload?.error || `growth endpoint returned ${response.status}`));
  }

  console.log(`[growth] generated_at=${payload.generatedAt}`);
  console.log(`[growth] target=${payload.target.activePayingCustomers} deadline=${payload.target.deadline}`);
  console.log(
    `[growth] founding_activated=${payload.foundingBeta.activatedCustomers} ` +
    `with_scan=${payload.foundingBeta.customersWithRecordedScan} ` +
    `active_7d=${payload.foundingBeta.customersActiveLast7Days}`
  );
  console.log(
    `[growth] codes_configured=${payload.foundingBeta.configuredCodes} ` +
    `codes_available=${payload.foundingBeta.availableCodes} ` +
    `active_devices=${payload.foundingBeta.activeDevices}`
  );
  console.log(
    `[growth] acquisition_sources=${Object.entries(payload.foundingBeta.acquisitionSources || {})
      .map(([source, count]) => `${source}:${count}`)
      .join(",") || "none"}`
  );
  console.log(
    `[growth] acquisition_campaigns=${Object.entries(payload.foundingBeta.acquisitionCampaigns || {})
      .map(([campaign, count]) => `${campaign}:${count}`)
      .join(",") || "none"}`
  );
  console.log(`[growth] referral_customers=${payload.foundingBeta.referralCustomers || 0}`);
  console.log(
    `[growth] daily_requests=${payload.protectedCapacity.requestsUsed}/${payload.protectedCapacity.dailyHardLimit} ` +
    `remaining=${payload.protectedCapacity.requestsRemaining}`
  );
  console.log(
    `[growth] feedback_total=${payload.resultQuality.feedbackTotal} ` +
    `helpful=${payload.resultQuality.helpful} ` +
    `needs_review=${payload.resultQuality.needsReview} ` +
    `helpful_percent=${payload.resultQuality.helpfulPercent ?? "n/a"}`
  );
  console.log(`[growth] payment_evidence=${payload.foundingBeta.paymentEvidence}`);
})().catch((error) => {
  console.error(`[growth] failed: ${String(error?.message || error)}`);
  process.exit(1);
});
