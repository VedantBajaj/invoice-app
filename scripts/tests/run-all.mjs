/**
 * Test runner — executes all test files
 * Usage: node run-all.mjs
 */
import { execSync } from "child_process";
import { readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const testFiles = readdirSync(__dirname)
  .filter(f => f.startsWith("test-") && f.endsWith(".mjs"))
  .sort();

let passed = 0;
let failed = 0;

for (const file of testFiles) {
  const path = join(__dirname, file);
  console.log(`\n=== Running ${file} ===`);
  try {
    execSync(`node --test ${path}`, { stdio: "inherit", timeout: 30000 });
    passed++;
  } catch (e) {
    failed++;
  }
}

console.log(`\n========================`);
console.log(`Results: ${passed} passed, ${failed} failed out of ${testFiles.length} test files`);
if (failed > 0) process.exit(1);
