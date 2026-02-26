/**
 * Test configuration — shared constants for all test suites.
 *
 * SAFETY: All test data uses distinctive prefixes (TST-, TSUP-, test*@test.com)
 * so it cannot be confused with real data. The test suite ONLY deletes records
 * it created, tracked by exact PocketBase record ID — never by filter or prefix.
 */

export const BASE_URL = process.env.PB_URL || "http://localhost:8090";

// PocketBase superuser (for seeding/cleanup — uses _superusers collection)
export const SUPERUSER_EMAIL = process.env.PB_ADMIN_EMAIL || "admin@bajaj.com";
export const SUPERUSER_PASSWORD = process.env.PB_ADMIN_PASSWORD || "admin123";

// Test user accounts (created during seed)
export const TEST_USERS = {
  admin:       { email: "testadmin@test.com",    password: "Test12345!", role: "admin",       name: "Test Admin" },
  manager:     { email: "testmanager@test.com",   password: "Test12345!", role: "manager",     name: "Test Manager" },
  salesperson: { email: "testsales@test.com",     password: "Test12345!", role: "salesperson",  name: "Test Sales" },
  viewer:      { email: "testviewer@test.com",    password: "Test12345!", role: "viewer",       name: "Test Viewer" },
};

// Minimal test products — just 2 (enough to cover all test scenarios)
export const TEST_PRODUCTS = [
  { product_code: "TST-001", name: "Test Saree Red",  barcode: "8901234560001", retail_price: 1500, mrp: 1500, purchase_price: 800,  cgst_pct: 2.5, sgst_pct: 2.5, hsn_code: "5407", unit: "PCS", current_stock: 50, min_stock: 10, active: true },
  { product_code: "TST-002", name: "Test Saree Blue", barcode: "8901234560002", retail_price: 2000, mrp: 2200, purchase_price: 1000, cgst_pct: 2.5, sgst_pct: 2.5, hsn_code: "5407", unit: "PCS", current_stock: 20, min_stock: 5,  active: true },
];

// Minimal test customers — just 1
export const TEST_CUSTOMERS = [
  { name: "Test Customer Amit", mobile: "9876500001", state: "Madhya Pradesh" },
];

// Test supplier
export const TEST_SUPPLIER = {
  supplier_code: "TSUP-001", name: "Test Supplier", address: "Test Road",
  city: "Harda", state: "Madhya Pradesh", phone: "9999000001", active: true,
};
