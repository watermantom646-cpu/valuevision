#!/usr/bin/env node

const crypto = require("crypto");

const requested = Number(process.argv[2] || 20);
const count = Math.min(200, Math.max(1, Math.floor(Number.isFinite(requested) ? requested : 20)));
const codes = Array.from({ length: count }, (_, index) => {
  const random = crypto.randomBytes(7).toString("hex").toUpperCase();
  return `VV-${String(index + 1).padStart(3, "0")}-${random}`;
});
const growthDashboardToken = crypto.randomBytes(24).toString("hex");

console.log(`Generated ${codes.length} private founding seller codes.`);
console.log("Store the following value in the backend secret manager as FOUNDING_SELLER_CODES:");
console.log(codes.join(","));
console.log("\nStore this separate value as GROWTH_DASHBOARD_TOKEN:");
console.log(growthDashboardToken);
console.log("\nCustomer fulfilment list:");
for (const code of codes) console.log(code);
