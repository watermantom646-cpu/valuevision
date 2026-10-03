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
  const easConfig = read("eas.json");
  const paywall = read("app/paywall.tsx");
  const billingHook = read("lib/use-valuevision-billing.ts");
  const paymentEntitlements = read("lib/payment-entitlements.ts");
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
    billingHook.includes("isTransactionVerifiedIOS") &&
      billingHook.includes("syncApplePurchase") &&
      billingHook.indexOf("await syncApplePurchase(purchase") < billingHook.indexOf("await finishTransaction({") &&
      paymentEntitlements.includes('/api/v1/payments/apple/verify'),
    "iOS transaction verification wired",
    "purchases receive a server entitlement before StoreKit transactions finish",
    results
  );
  assertCheck(
    paywall.includes('Platform.OS === "web"') &&
      paywall.includes("Apple ID"),
    "web and native payment copy are separated",
    "web uses hosted checkout while native billing remains Apple-managed",
    results
  );
  assertCheck(
    featureFlags.includes("EXPO_PUBLIC_CAR_VALUATIONS_AVAILABLE") &&
      easConfig.includes('"EXPO_PUBLIC_CAR_VALUATIONS_AVAILABLE": "1"'),
    "production car valuations enabled",
    "production build exposes basic Brego valuations",
    results
  );
  assertCheck(
    featureFlags.includes("EXPO_PUBLIC_FULL_CAR_CHECKS_AVAILABLE") &&
      easConfig.includes('"EXPO_PUBLIC_FULL_CAR_CHECKS_AVAILABLE": "1"'),
    "production full car checks enabled",
    "the £4.50 Brego advanced check is exposed in the production build",
    results
  );
  assertCheck(fs.existsSync(checklistPath), "Apple payment checklist exists", checklistPath, results);
  assertCheck(fs.existsSync(cueCardPath), "Mashtag cue card exists", cueCardPath, results);

  const ok = results.every((row) => row.ok);
  const summary = {
    ok,
    localBillingConfiguration: ok ? "ready_for_testflight_sandbox_test" : "needs_attention",
    monthlyProductId,
    carChecksAvailable: easConfig.includes('"EXPO_PUBLIC_FULL_CAR_CHECKS_AVAILABLE": "1"'),
    claimPaymentsLive: false,
    honestPaymentStatus:
      "The monthly and full car-check products are configured in the iOS build. Final Apple/TestFlight sandbox purchase verification is still required before calling payments live.",
    requiredExternalChecks: [
      "Confirm the new production build appears in App Store Connect/TestFlight.",
      "Install the TestFlight build on a real iPhone.",
      "Verify the monthly subscription product loads.",
      "Complete one Apple sandbox purchase.",
      "Confirm monthly access unlocks after purchase.",
      "Complete one £4.50 sandbox car-check purchase and confirm one server credit is granted.",
      "Confirm Restore Purchase works.",
    ],
    checks: results,
  };

  console.log(JSON.stringify(summary, null, 2));
  if (!ok) process.exit(1);
}

main();
