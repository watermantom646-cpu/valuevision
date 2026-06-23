#!/usr/bin/env node

const { spawnSync } = require("child_process");

function run(label, command, args) {
  console.log(`\n[mashtag-meeting] ${label}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.error(`\n[mashtag-meeting] FAIL: ${label}`);
    process.exit(result.status || 1);
  }
}

run("production demo health", "npm", ["run", "launch:mashtag"]);
run("payment readiness audit", "npm", ["run", "launch:payments"]);

console.log("\n[mashtag-meeting] PASS");
console.log("[mashtag-meeting] Demo is green. Payments are configured, but only call them live after Apple/TestFlight sandbox purchase verification.");
console.log("[mashtag-meeting] Car checks remain paused until provider billing is reset.");
