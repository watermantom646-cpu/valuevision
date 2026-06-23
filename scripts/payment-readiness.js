#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assertCheck(condition, label, detail, results) {
  results.push({ ok: Boolean(condition), label, detail });
}

function extractConstString(source, key) {
  const match = source.match(new RegExp(`${key}:\\s*"([^"]+)"`));
  return match?.[1] || "";
}

function main() {
  const results = [];
  const pricing = read("constants/pricing.ts");
  const featureFlags = read("constants/feature-flags.ts");
  const paywall = read("app/paywall.tsx");
  const billingHook = read("lib/use-valuevision-billing.ts");
  const checklistPath = path.join(root, "docs/apple-testflight-payment-checklist-2026-06-22.md");
  const cueCardPath = path.join(root, "docs/mashtag-live-cue-card-2026-06-23.md");

  const monthlyProductId = extractConstString(pricing, "monthlySubscriptionProductId");
  const singleCarProductId = extractConstString(pricing, "fullCarCheckSingleProductId");
  const bundleCarProductId = extractConstString(pricing, "fullCarCheckBundleProductId");

  assertCheck(monthlyProductId.length > 0, "monthly SKU configured", monthlyProductId, results);
  assertCheck(singleCarProductId.length > 0, "single car-check SKU configured", singleCarProductId, results);
  assertCheck(bundleCarProductId.length > 0, "bundle car-check SKU configured", bundleCarProductId, results);
  assertCheck(
    billingHook.includes("expo-iap") &&
      billingHook.includes("fetchProducts") &&
      billingHook.includes("requestPurchase") &&
      billingHook.includes("restorePurchases"),
    "native billing hook wired",
    "fetch, purchase, and restore paths are present",
    results
  );
  assertCheck(
    billingHook.includes("isTransactionVerifiedIOS") && billingHook.includes("finishTransaction"),
    "iOS transaction verification wired",
    "purchase updates verify and finish transactions",
    results
  );
  assertCheck(
    paywall.includes("No payment is taken on this web preview") &&
      paywall.includes("Use the iOS TestFlight/App Store build to verify the Apple subscription"),
    "web paywall cannot overclaim payment",
    "web copy points users to iOS TestFlight/App Store verification",
    results
  );
  assertCheck(
    featureFlags.includes("carChecksAvailable: false") &&
      featureFlags.includes("provider balance is cleared"),
    "car checks paused while provider billing is unresolved",
    "one-off vehicle check buttons remain hidden",
    results
  );
  assertCheck(fs.existsSync(checklistPath), "Apple payment checklist exists", checklistPath, results);
  assertCheck(fs.existsSync(cueCardPath), "Mashtag cue card exists", cueCardPath, results);

  const ok = results.every((row) => row.ok);
  const summary = {
    ok,
    localBillingConfiguration: ok ? "ready_for_testflight_sandbox_test" : "needs_attention",
    monthlyProductId,
    carChecksAvailable: false,
    claimPaymentsLive: false,
    honestPaymentStatus:
      "The monthly product is configured in the iOS build. Final Apple/TestFlight sandbox purchase verification is still required before calling payments live.",
    requiredExternalChecks: [
      "Confirm iOS build 1.0.2 (27) appears in App Store Connect/TestFlight.",
      "Install the TestFlight build on a real iPhone.",
      "Verify the monthly subscription product loads.",
      "Complete one Apple sandbox purchase.",
      "Confirm monthly access unlocks after purchase.",
      "Confirm Restore Purchase works.",
    ],
    checks: results,
  };

  console.log(JSON.stringify(summary, null, 2));
  if (!ok) process.exit(1);
}

main();
