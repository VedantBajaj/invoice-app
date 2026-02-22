/**
 * Test configuration — shared constants for all test suites.
 * No external dependencies. Works with Node 18+ built-in fetch.
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

// Test products — varying stock levels and edge cases
export const TEST_PRODUCTS = [
  { product_code: "TST-001", name: "Test Saree Red",    barcode: "8901234560001", retail_price: 1500, mrp: 1500, purchase_price: 800,  cgst_pct: 2.5, sgst_pct: 2.5, hsn_code: "5407", unit: "PCS", current_stock: 100, min_stock: 10, active: true },
  { product_code: "TST-002", name: "Test Saree Blue",   barcode: "8901234560002", retail_price: 2000, mrp: 2200, purchase_price: 1000, cgst_pct: 2.5, sgst_pct: 2.5, hsn_code: "5407", unit: "PCS", current_stock: 50,  min_stock: 10, active: true },
  { product_code: "TST-003", name: "Test Kurti Green",  barcode: "8901234560003", retail_price: 700,  mrp: 700,  purchase_price: 350,  cgst_pct: 2.5, sgst_pct: 2.5, hsn_code: "6104", unit: "PCS", current_stock: 3,   min_stock: 10, active: true },  // LOW STOCK
  { product_code: "TST-004", name: "Test Dupatta Gold",  barcode: "8901234560004", retail_price: 300,  mrp: 350,  purchase_price: 150,  cgst_pct: 2.5, sgst_pct: 2.5, hsn_code: "6214", unit: "PCS", current_stock: -5,  min_stock: 10, active: true },  // NEGATIVE STOCK
  { product_code: "TST-005", name: "Test Fabric Roll",  barcode: "",              retail_price: 250,  mrp: 250,  purchase_price: 120,  cgst_pct: 2.5, sgst_pct: 2.5, hsn_code: "5208", unit: "M",   current_stock: 200, min_stock: 50, active: true },  // NO BARCODE
];

// Test customers
export const TEST_CUSTOMERS = [
  { name: "Test Customer Amit",  mobile: "9876500001", state: "Madhya Pradesh" },
  { name: "Test Customer Priya", mobile: "9876500002", state: "Maharashtra" },
];

// Test supplier
export const TEST_SUPPLIER = {
  supplier_code: "TSUP-001", name: "Test Supplier", address: "Test Road",
  city: "Harda", state: "Madhya Pradesh", phone: "9999000001", active: true,
};
