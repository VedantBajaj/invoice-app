/**
 * Shared test utilities for the invoice API test suite.
 * No external dependencies — uses Node 18+ built-in fetch.
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
    // settings collection may not exist or counter not set — that's fine
    counterSnapshot = null;
  }

  return { userIds, userTokens, productIds, customerIds, supplierId, counterSnapshot };
}

/**
 * Deletes all test data created by seedTestData.
 * Deletion order matters to avoid foreign-key constraint issues:
 *   stock_movements -> invoices -> customers -> products -> suppliers -> users
 * Also restores the invoice counter to its pre-test value.
 */
async function cleanupTestData(superToken, seedIds) {
  const { userIds, productIds, customerIds, supplierId, counterSnapshot } = seedIds;

  // Helper: list records matching a filter, then delete each by ID
  async function deleteByFilter(collection, filter) {
    try {
      let page = 1;
      while (true) {
        const encoded = encodeURIComponent(filter);
        const data = await apiCall(
          "GET",
          `/api/collections/${collection}/records?filter=${encoded}&perPage=200&page=${page}`,
          null,
          superToken
        );
        for (const item of data.items) {
          try {
            await apiCall("DELETE", `/api/collections/${collection}/records/${item.id}`, null, superToken);
          } catch (e) {
            // Log but continue — best-effort cleanup
            console.error(`  cleanup: failed to delete ${collection}/${item.id}: ${e.message}`);
          }
        }
        if (page >= data.totalPages || data.items.length === 0) break;
        page++;
      }
    } catch {
      // Collection may not exist or filter may match nothing — that's fine
    }
  }

  // Helper: build PocketBase OR-filter for product IDs
  // e.g. product="id1" || product="id2"
  function productFilter(ids) {
    return ids.map((id) => `product="${id}"`).join(" || ");
  }

  // Helper: build OR-filter for user IDs (created_by field)
  function userFilter(ids) {
    return Object.values(ids).map((id) => `created_by="${id}"`).join(" || ");
  }

  // 1. Stock movements referencing test products
  if (productIds.length > 0) {
    await deleteByFilter("stock_movements", productFilter(productIds));
  }

  // 2. Invoice items + invoices created by test users
  //    First delete invoice_items for those invoices, then the invoices themselves
  if (Object.keys(userIds).length > 0) {
    // Find invoices created by test users
    try {
      const filter = userFilter(userIds);
      let page = 1;
      while (true) {
        const encoded = encodeURIComponent(filter);
        const data = await apiCall(
          "GET",
          `/api/collections/invoices/records?filter=${encoded}&perPage=200&page=${page}`,
          null,
          superToken
        );
        // Delete invoice items for each invoice
        for (const inv of data.items) {
          await deleteByFilter("invoice_items", `invoice="${inv.id}"`);
          await apiCall("DELETE", `/api/collections/invoices/records/${inv.id}`, null, superToken);
        }
        if (page >= data.totalPages || data.items.length === 0) break;
        page++;
      }
    } catch {
      // Best effort
    }
  }

  // 3. Customers
  for (const id of customerIds) {
    try {
      await apiCall("DELETE", `/api/collections/customers/records/${id}`, null, superToken);
    } catch {
      // Best effort
    }
  }

  // 4. Products
  for (const id of productIds) {
    try {
      await apiCall("DELETE", `/api/collections/products/records/${id}`, null, superToken);
    } catch {
      // Best effort
    }
  }

  // 5. Supplier
  if (supplierId) {
    try {
      await apiCall("DELETE", `/api/collections/suppliers/records/${supplierId}`, null, superToken);
    } catch {
      // Best effort
    }
  }

  // 6. Users
  for (const id of Object.values(userIds)) {
    try {
      await apiCall("DELETE", `/api/collections/users/records/${id}`, null, superToken);
    } catch {
      // Best effort
    }
  }

  // 7. Restore invoice counter
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
 *
 * @param {string} name - Suite name
 * @param {Array<{name: string, fn: Function}>} tests - Test cases
 * @returns {{passed: number, failed: number, errors: Array<{name: string, error: Error}>}}
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
