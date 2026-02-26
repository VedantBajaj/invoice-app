/**
 * Shared test utilities for the invoice API test suite.
 * No external dependencies — uses Node 18+ built-in fetch.
 *
 * SAFETY RULES:
 * 1. Every record created is tracked by its PocketBase record ID.
 * 2. Cleanup ONLY deletes records by their exact tracked ID.
 * 3. Before deleting, we verify the record still has a TST-/TSUP-/test prefix.
 * 4. No filter-based bulk deletions. No wildcards. No broad queries for deletion.
 * 5. If a record fails the prefix check, it is SKIPPED (never deleted).
 */

import {
  BASE_URL,
  SUPERUSER_EMAIL,
  SUPERUSER_PASSWORD,
  TEST_USERS,
  TEST_PRODUCTS,
  TEST_CUSTOMERS,
  TEST_SUPPLIER,
} from "./config.mjs";

// ===== ANSI Colors =====

const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

// ===== API Helpers =====

/**
 * Generic fetch wrapper. Returns parsed JSON. Throws on non-2xx with status attached.
 */
async function apiCall(method, path, body = null, token = null) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (token) opts.headers["Authorization"] = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${path}`, opts);

  // Handle 204 No Content (e.g. DELETE)
  if (res.status === 204) return null;

  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const err = new Error(
      `API ${method} ${path} failed (${res.status}): ${JSON.stringify(data)}`
    );
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/**
 * Authenticate as PocketBase superuser.
 * Returns the auth token string.
 */
async function authenticateSuperuser() {
  const data = await apiCall("POST", "/api/collections/_superusers/auth-with-password", {
    identity: SUPERUSER_EMAIL,
    password: SUPERUSER_PASSWORD,
  });
  return data.token;
}

/**
 * Authenticate a regular user.
 * Returns { token, record }.
 */
async function authenticateUser(email, password) {
  const data = await apiCall("POST", "/api/collections/users/auth-with-password", {
    identity: email,
    password,
  });
  return { token: data.token, record: data.record };
}

// ===== Seed & Cleanup =====

/**
 * Seeds all test data into PocketBase.
 *
 * Creates: users, products, customers, supplier.
 * Returns an object with all created IDs and tokens so tests can reference them
 * and cleanup can delete them.
 *
 * Idempotent: if a record already exists (unique constraint), finds it instead.
 */
async function seedTestData(superToken) {
  const userIds = {};
  const userTokens = {};
  const productIds = [];
  const customerIds = [];
  let supplierId = null;

  // --- Users (idempotent: skip if already exists) ---
  for (const [role, user] of Object.entries(TEST_USERS)) {
    try {
      const record = await apiCall("POST", "/api/collections/users/records", {
        email: user.email,
        password: user.password,
        passwordConfirm: user.password,
        name: user.name,
        role: user.role,
        verified: true,
      }, superToken);
      userIds[role] = record.id;
    } catch (err) {
      // Already exists — find by email
      const list = await apiCall("GET",
        `/api/collections/users/records?filter=(email="${user.email}")`,
        null, superToken);
      userIds[role] = list.items[0].id;
    }

    // Authenticate each user to get their token
    const auth = await authenticateUser(user.email, user.password);
    userTokens[role] = auth.token;
  }

  // --- Products (use admin user's token — admin role can create products) ---
  const adminToken = userTokens.admin;
  for (const product of TEST_PRODUCTS) {
    try {
      const record = await apiCall(
        "POST",
        "/api/collections/products/records",
        product,
        adminToken
      );
      productIds.push(record.id);
    } catch (err) {
      // Already exists — find by product_code
      const list = await apiCall("GET",
        `/api/collections/products/records?filter=(product_code="${product.product_code}")`,
        null, adminToken);
      productIds.push(list.items[0].id);
    }
  }

  // --- Customers ---
  for (const customer of TEST_CUSTOMERS) {
    try {
      const record = await apiCall(
        "POST",
        "/api/collections/customers/records",
        customer,
        adminToken
      );
      customerIds.push(record.id);
    } catch (err) {
      // Already exists — find by mobile
      const list = await apiCall("GET",
        `/api/collections/customers/records?filter=(mobile="${customer.mobile}")`,
        null, adminToken);
      customerIds.push(list.items[0].id);
    }
  }

  // --- Supplier ---
  try {
    const supplierRecord = await apiCall(
      "POST",
      "/api/collections/suppliers/records",
      TEST_SUPPLIER,
      adminToken
    );
    supplierId = supplierRecord.id;
  } catch (err) {
    // Already exists — find by supplier_code
    const list = await apiCall("GET",
      `/api/collections/suppliers/records?filter=(supplier_code="${TEST_SUPPLIER.supplier_code}")`,
      null, adminToken);
    supplierId = list.items[0].id;
  }

  // --- Snapshot invoice counter so we can restore it later ---
  let counterSnapshot = null;
  try {
    const counterRec = await apiCall(
      "GET",
      `/api/collections/settings/records?filter=(key="invoice_counter")`,
      null,
      superToken
    );
    if (counterRec.items.length > 0) {
      counterSnapshot = {
        id: counterRec.items[0].id,
        value: counterRec.items[0].value,
      };
    }
  } catch {
    counterSnapshot = null;
  }

  return { userIds, userTokens, productIds, customerIds, supplierId, counterSnapshot };
}

/**
 * SAFE cleanup: deletes ONLY the records tracked by exact ID.
 *
 * Before each deletion, fetches the record and verifies it has a test-data prefix
 * (TST-, TSUP-, test*@test.com, TEST-). If the prefix check fails, the record
 * is SKIPPED to prevent accidental deletion of real data.
 *
 * Order: stock_movements → invoice_items → invoices → customers → products → suppliers → users
 */
async function cleanupTestData(superToken, seedIds) {
  const { userIds, productIds, customerIds, supplierId, counterSnapshot } = seedIds;

  /**
   * Safe delete: fetch the record, verify it has a test prefix, then delete.
   * Returns true if deleted, false if skipped.
   */
  async function safeDelete(collection, id) {
    try {
      // Fetch the record first to verify it's test data
      const record = await apiCall(
        "GET",
        `/api/collections/${collection}/records/${id}`,
        null,
        superToken
      );

      // Verify test-data prefix based on collection type
      let isTestData = false;
      switch (collection) {
        case "products":
          isTestData = (record.product_code || "").startsWith("TST-");
          break;
        case "customers":
          isTestData = (record.name || "").startsWith("Test Customer") ||
                       (record.mobile || "").startsWith("98765000");
          break;
        case "suppliers":
          isTestData = (record.supplier_code || "").startsWith("TSUP-");
          break;
        case "users":
          isTestData = (record.email || "").endsWith("@test.com");
          break;
        case "invoices":
          isTestData = (record.invoice_number || "").startsWith("TEST-") ||
                       (record.invoice_number || "").startsWith("MANUAL-") ||
                       (record.invoice_number || "").startsWith("REV-");
          break;
        case "invoice_items":
        case "stock_movements":
          // These are child records linked to test products/invoices — safe if tracked
          isTestData = true;
          break;
        case "settings":
          isTestData = (record.key || "").startsWith("test_");
          break;
        default:
          isTestData = false;
      }

      if (!isTestData) {
        console.error(`  SAFETY: SKIPPED ${collection}/${id} — failed prefix check`);
        return false;
      }

      await apiCall("DELETE", `/api/collections/${collection}/records/${id}`, null, superToken);
      return true;
    } catch (e) {
      // Record may already be deleted (cascade, earlier test, etc.) — that's fine
      return false;
    }
  }

  // 1. Delete records created during tests (tracked by ID, in reverse order)
  if (seedIds.createdDuringTests) {
    for (const rec of [...seedIds.createdDuringTests].reverse()) {
      await safeDelete(rec.collection, rec.id);
    }
  }

  // 2. Customers (by tracked ID)
  for (const id of customerIds) {
    await safeDelete("customers", id);
  }

  // 3. Products (by tracked ID)
  for (const id of productIds) {
    await safeDelete("products", id);
  }

  // 4. Supplier (by tracked ID)
  if (supplierId) {
    await safeDelete("suppliers", supplierId);
  }

  // 5. Users (by tracked ID)
  for (const id of Object.values(userIds)) {
    await safeDelete("users", id);
  }

  // 6. Restore invoice counter
  if (counterSnapshot) {
    try {
      await apiCall(
        "PATCH",
        `/api/collections/settings/records/${counterSnapshot.id}`,
        { value: counterSnapshot.value },
        superToken
      );
    } catch {
      // Best effort
    }
  }
}

// ===== Assertions =====

/**
 * Simple assertion. Throws an Error with message if condition is falsy.
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

/**
 * Asserts that the given async function throws.
 * Optionally checks that the thrown error has the expected HTTP status.
 */
async function assertThrows(asyncFn, expectedStatus = null) {
  let threw = false;
  try {
    await asyncFn();
  } catch (err) {
    threw = true;
    if (expectedStatus !== null && err.status !== expectedStatus) {
      throw new Error(
        `Expected HTTP ${expectedStatus} but got ${err.status || "no status"}: ${err.message}`
      );
    }
  }
  if (!threw) {
    throw new Error("Expected function to throw, but it did not");
  }
}

// ===== Test Runner =====

/**
 * Runs an array of test cases sequentially and prints results.
 */
async function runSuite(name, tests) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${name}`);
  console.log(`${"=".repeat(60)}\n`);

  let passed = 0;
  let failed = 0;
  const errors = [];

  for (const test of tests) {
    try {
      await test.fn();
      passed++;
      console.log(`  ${green("PASS")}  ${test.name}`);
    } catch (err) {
      failed++;
      errors.push({ name: test.name, error: err });
      console.log(`  ${red("FAIL")}  ${test.name}`);
      console.log(`        ${red(err.message)}`);
    }
  }

  console.log();
  console.log(
    `  Results: ${green(`${passed} passed`)}, ${failed > 0 ? red(`${failed} failed`) : `${failed} failed`} of ${tests.length} tests`
  );

  if (errors.length > 0) {
    console.log(`\n  ${yellow("Failures:")}`);
    for (const { name: tName, error } of errors) {
      console.log(`    ${red("x")} ${tName}`);
      console.log(`      ${error.message}`);
    }
  }

  console.log();
  return { passed, failed, errors };
}

export {
  apiCall,
  authenticateSuperuser,
  authenticateUser,
  seedTestData,
  cleanupTestData,
  assert,
  assertThrows,
  green,
  red,
  yellow,
  runSuite,
  BASE_URL,
};
