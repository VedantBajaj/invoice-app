#!/usr/bin/env node
/**
 * Test Orchestrator — runs all Node.js test suites
 * Usage: node tests/run-tests.mjs [--base-url http://localhost:8090]
 */
import { execSync } from "node:child_process";
import { BASE_URL } from "./config.mjs";

async function main() {
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║   Invoice App — Test Runner          ║");
  console.log("╚══════════════════════════════════════╝\n");

  // 1. Health check
  console.log("⏳ Checking PocketBase health...");
  try {
    const res = await fetch(`${BASE_URL}/api/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    console.log("✅ PocketBase is running\n");
  } catch (e) {
    console.error(`❌ PocketBase is not running at ${BASE_URL}`);
    console.error("   Start it with: pocketbase serve --http 0.0.0.0:8090\n");
    process.exit(1);
  }

  let failures = 0;

  // 2. Unit tests
  console.log("━━━ Unit Tests (GST + Discount) ━━━\n");
  try {
    execSync("node tests/unit-tests.mjs", { stdio: "inherit", cwd: process.cwd() });
  } catch {
    failures++;
  }

  // 3. API tests
  console.log("\n━━━ API Tests (Backend) ━━━\n");
  try {
    execSync("node tests/api-tests.mjs", { stdio: "inherit", cwd: process.cwd() });
  } catch {
    failures++;
  }

  // 4. Browser test instructions
  console.log("\n━━━ Browser Tests ━━━\n");
  console.log(`Open in your browser: ${BASE_URL}/tests/test.html`);
  console.log("These tests run the real app JS in the browser.\n");

  // 5. Summary
  if (failures > 0) {
    console.log("\n❌ Some test suites failed\n");
    process.exit(1);
  } else {
    console.log("\n✅ All Node.js tests passed!\n");
    process.exit(0);
  }
}

main();
