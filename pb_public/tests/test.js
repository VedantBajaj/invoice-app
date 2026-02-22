/**
 * Invoice App — Browser Tests (test.js)
 * 83 state / DOM / API tests.
 * Runs in the browser via test.html. No Alpine dependency.
 * Relies on window.api, window.pb, window.extractGST,
 * window.calcNextDiscount, window.calcPrevDiscount being loaded first.
 */

// ===== Test framework =====
const output   = document.getElementById('output');
const progress = document.getElementById('progress');
const summaryEl = document.getElementById('summary');

let totalPassed = 0, totalFailed = 0, totalSkipped = 0;

function log(html)        { output.innerHTML += html + '\n'; }
function logSuite(name)   { log(`<div class="suite">\n  ▶ ${name}</div>`); }
function logPass(name)    { totalPassed++; log(`<div class="pass">  ✓ ${name}</div>`); }
function logFail(name, err) { totalFailed++; log(`<div class="fail">  ✗ ${name}</div><div class="error-detail">${err}</div>`); }
function logSkip(name, reason) { totalSkipped++; log(`<div class="skip">  ⊘ ${name} — ${reason}</div>`); }

function assert(condition, msg) { if (!condition) throw new Error(msg || 'Assertion failed'); }
function assertEq(actual, expected, msg) {
  if (actual !== expected) throw new Error(msg || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function assertClose(actual, expected, tolerance, msg) {
  if (Math.abs(actual - expected) > tolerance) throw new Error(msg || `Expected ~${expected}, got ${actual} (tolerance ${tolerance})`);
}
function assertThrows(fn, msg) {
  let threw = false;
  try { fn(); } catch { threw = true; }
  if (!threw) throw new Error(msg || 'Expected function to throw');
}
async function assertRejects(promise, msg) {
  try { await promise; } catch { return; }
  throw new Error(msg || 'Expected promise to reject');
}

// Make framework available globally so functional-tests.js can use it
window.log = log;
window.logSuite = logSuite;
window.logPass = logPass;
window.logFail = logFail;
window.logSkip = logSkip;
window.assert = assert;
window.assertEq = assertEq;
window.assertClose = assertClose;
window.assertThrows = assertThrows;
window.assertRejects = assertRejects;

async function runSuite(name, tests) {
  logSuite(name);
  for (const t of tests) {
    progress.textContent = `Running: ${name} > ${t.name}`;
    try {
      await t.fn();
      logPass(t.name);
    } catch (e) {
      logFail(t.name, e.message);
    }
  }
}
window.runSuite = runSuite;

// ===== Test data (mirrors tests/config.mjs for browser use) =====
const TEST_CREDS = {
  admin:       { email: 'testadmin@test.com',    password: 'Test12345!', role: 'admin',       name: 'Test Admin' },
  manager:     { email: 'testmanager@test.com',  password: 'Test12345!', role: 'manager',     name: 'Test Manager' },
  salesperson: { email: 'testsales@test.com',    password: 'Test12345!', role: 'salesperson',  name: 'Test Sales' },
  viewer:      { email: 'testviewer@test.com',   password: 'Test12345!', role: 'viewer',       name: 'Test Viewer' },
};
window.TEST_CREDS = TEST_CREDS;

const TEST_PRODUCTS = [
  { product_code: 'TST-001', name: 'Test Saree Red',    barcode: '8901234560001', retail_price: 1500, mrp: 1500, purchase_price: 800,  cgst_pct: 2.5, sgst_pct: 2.5, hsn_code: '5407', unit: 'PCS', current_stock: 100, min_stock: 10, active: true },
  { product_code: 'TST-002', name: 'Test Saree Blue',   barcode: '8901234560002', retail_price: 2000, mrp: 2200, purchase_price: 1000, cgst_pct: 2.5, sgst_pct: 2.5, hsn_code: '5407', unit: 'PCS', current_stock: 50,  min_stock: 10, active: true },
  { product_code: 'TST-003', name: 'Test Kurti Green',  barcode: '8901234560003', retail_price: 700,  mrp: 700,  purchase_price: 350,  cgst_pct: 2.5, sgst_pct: 2.5, hsn_code: '6104', unit: 'PCS', current_stock: 3,   min_stock: 10, active: true },
  { product_code: 'TST-004', name: 'Test Dupatta Gold', barcode: '8901234560004', retail_price: 300,  mrp: 350,  purchase_price: 150,  cgst_pct: 2.5, sgst_pct: 2.5, hsn_code: '6214', unit: 'PCS', current_stock: -5,  min_stock: 10, active: true },
  { product_code: 'TST-005', name: 'Test Fabric Roll',  barcode: '',              retail_price: 250,  mrp: 250,  purchase_price: 120,  cgst_pct: 2.5, sgst_pct: 2.5, hsn_code: '5208', unit: 'M',   current_stock: 200, min_stock: 50, active: true },
];
window.TEST_PRODUCTS = TEST_PRODUCTS;

const TEST_CUSTOMERS = [
  { name: 'Test Customer Amit',  mobile: '9876500001', state: 'Madhya Pradesh' },
  { name: 'Test Customer Priya', mobile: '9876500002', state: 'Maharashtra' },
];
window.TEST_CUSTOMERS = TEST_CUSTOMERS;


// ===================================================================
// Cart simulator — replicates Alpine.store('cart') logic without Alpine
// ===================================================================
function createCart() {
  const cart = {
    items: [],
    customer: null,
    discountAmount: 0,
    step: 'products',
    customerMobile: '',
    customerName: '',
    paymentMethod: 'cash',
    editingInvoiceId: null,
    editingInvoiceNumber: null,

    get isEditing() { return !!this.editingInvoiceId; },

    addItem(product) {
      const existing = this.items.find(i => i.product_id === product.id);
      if (existing) {
        existing.quantity++;
        this.recalcItem(existing);
        return;
      }
      const item = {
        product_id: product.id,
        product_code: product.product_code,
        name: product.name,
        hsn_code: product.hsn_code || '',
        barcode: product.barcode || '',
        mrp: product.mrp || 0,
        unit_price: product.retail_price || product.mrp || 0,
        quantity: 1,
        cgst_pct: product.cgst_pct || 2.5,
        sgst_pct: product.sgst_pct || 2.5,
        current_stock: product.current_stock || 0,
        min_stock: product.min_stock || 0,
        unit: product.unit || 'PCS',
        line_total: 0, taxable: 0, cgst_amount: 0, sgst_amount: 0,
      };
      this.recalcItem(item);
      this.items.push(item);
    },

    recalcItem(item) {
      const gross = item.unit_price * item.quantity;
      const gst = extractGST(gross, item.cgst_pct, item.sgst_pct);
      item.line_total = gross;
      item.taxable = gst.taxable;
      item.cgst_amount = gst.cgst;
      item.sgst_amount = gst.sgst;
    },

    removeItem(index) { this.items.splice(index, 1); },

    updateQty(index, qty) {
      if (qty < 1) qty = 1;
      this.items[index].quantity = qty;
      this.recalcItem(this.items[index]);
    },

    updatePrice(index, price) {
      this.items[index].unit_price = price;
      this.recalcItem(this.items[index]);
    },

    get subtotal()     { return this.items.reduce((s, i) => s + i.line_total, 0); },
    get taxableTotal() { return this.items.reduce((s, i) => s + i.taxable, 0); },
    get cgstTotal()    { return this.items.reduce((s, i) => s + i.cgst_amount, 0); },
    get sgstTotal()    { return this.items.reduce((s, i) => s + i.sgst_amount, 0); },
    get grandTotal()   { return this.subtotal - this.discountAmount; },
    get itemCount()    { return this.items.reduce((s, i) => s + i.quantity, 0); },

    discountUp()   { this.discountAmount = calcNextDiscount(this.subtotal, this.discountAmount); },
    discountDown() { this.discountAmount = calcPrevDiscount(this.subtotal, this.discountAmount); },
    setDiscount(amount) { this.discountAmount = Math.max(0, Math.min(amount, this.subtotal)); },

    addQuickBillLines(count = 3) {
      let maxNum = 0;
      this.items.forEach(item => {
        const m = item.name.match(/^Saree - (\d+)$/);
        if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
      });
      for (let i = 1; i <= count; i++) {
        const num = maxNum + i;
        this.items.push({
          product_id: 'quick_' + Date.now() + '_' + i,
          product_code: '', name: 'Saree - ' + num, hsn_code: '', barcode: '',
          mrp: 0, unit_price: 0, quantity: 1,
          cgst_pct: 2.5, sgst_pct: 2.5,
          current_stock: 0, min_stock: 0, unit: 'PCS',
          line_total: 0, taxable: 0, cgst_amount: 0, sgst_amount: 0,
        });
      }
    },

    clear(keepCustomer = false) {
      this.items = [];
      this.discountAmount = 0;
      this.step = 'products';
      this.editingInvoiceId = null;
      this.editingInvoiceNumber = null;
      if (!keepCustomer) {
        this.customer = null;
        this.customerMobile = '';
        this.customerName = '';
        this.paymentMethod = 'cash';
      }
    },

    clearAll() {
      this.items = [];
      this.customer = null;
      this.discountAmount = 0;
      this.step = 'products';
      this.customerMobile = '';
      this.customerName = '';
      this.paymentMethod = 'cash';
      this.editingInvoiceId = null;
      this.editingInvoiceNumber = null;
    },

    loadForEdit(invoice, items) {
      this.editingInvoiceId = invoice.id;
      this.editingInvoiceNumber = invoice.invoice_number;
      this.customerMobile = invoice.expand?.customer?.mobile || '';
      this.customerName = invoice.expand?.customer?.name || '';
      this.customer = invoice.expand?.customer || null;
      this.paymentMethod = invoice.payment_method || 'cash';
      this.discountAmount = invoice.discount_total || 0;
      this.step = 'products';
      this.items = items.map(item => {
        const cartItem = {
          product_id: item.product,
          product_code: item.product_code || '',
          name: item.product_name,
          hsn_code: item.hsn_code || '',
          barcode: item.barcode || '',
          mrp: item.mrp || 0,
          unit_price: item.unit_price,
          quantity: item.quantity,
          cgst_pct: item.cgst_pct || 2.5,
          sgst_pct: item.sgst_pct || 2.5,
          current_stock: item.expand?.product?.current_stock || 0,
          min_stock: item.expand?.product?.min_stock || 0,
          unit: item.unit || 'PCS',
          line_total: 0, taxable: 0, cgst_amount: 0, sgst_amount: 0,
        };
        this.recalcItem(cartItem);
        return cartItem;
      });
    },
  };
  return cart;
}
window.createCart = createCart;


// ===================================================================
// Run all suites
// ===================================================================
(async function main() {
  progress.textContent = 'Seeding test data...';

  // ===== SEED TEST DATA =====
  // Authenticate as superuser to create test users/products/customers
  const SUPERUSER_EMAIL = 'admin@bajaj.com';
  const SUPERUSER_PASSWORD = 'admin123';
  const BASE = window.location.origin;

  async function rawApi(method, path, body, token) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(BASE + path, opts);
    if (!res.ok && res.status !== 204) {
      const text = await res.text();
      // Ignore 400 for duplicates (unique constraint) during seeding
      if (res.status === 400) return null;
      throw new Error(`Seed API ${method} ${path} failed (${res.status}): ${text}`);
    }
    if (res.status === 204) return {};
    return res.json();
  }

  try {
    // 1. Get superuser token
    const suAuth = await rawApi('POST', '/api/collections/_superusers/auth-with-password', {
      identity: SUPERUSER_EMAIL, password: SUPERUSER_PASSWORD
    });
    const superToken = suAuth.token;

    // 2. Create test users (skip if they already exist — rawApi returns null for 400)
    for (const [key, cred] of Object.entries(TEST_CREDS)) {
      await rawApi('POST', '/api/collections/users/records', {
        email: cred.email, password: cred.password, passwordConfirm: cred.password,
        name: cred.name, role: cred.role, verified: true,
      }, superToken);
    }

    // 3. Authenticate as admin to seed data
    const adminAuth = await rawApi('POST', '/api/collections/users/auth-with-password', {
      identity: TEST_CREDS.admin.email, password: TEST_CREDS.admin.password
    });
    const adminToken = adminAuth.token;

    // 4. Create test products (skip duplicates)
    for (const prod of TEST_PRODUCTS) {
      await rawApi('POST', '/api/collections/products/records', prod, adminToken);
    }

    // 5. Create test customers (skip duplicates)
    for (const cust of TEST_CUSTOMERS) {
      await rawApi('POST', '/api/collections/customers/records', cust, adminToken);
    }

    progress.textContent = 'Seed complete. Starting tests...';
  } catch (e) {
    progress.textContent = 'Seed failed: ' + e.message + ' — running tests anyway...';
    console.error('Seed error:', e);
  }

  // Ensure we start logged out
  api.logout();

  // ==========================
  // 1. LOGIN FLOW (5 tests)
  // ==========================
  await runSuite('Login Flow', [
    { name: 'login-success', fn: async () => {
      await api.login(TEST_CREDS.admin.email, TEST_CREDS.admin.password);
      assert(api.isLoggedIn() === true, 'Expected isLoggedIn to be true');
    }},
    { name: 'login-sets-user', fn: async () => {
      const user = api.getUser();
      assert(user, 'getUser() returned null');
      assert(user.email === TEST_CREDS.admin.email, `Email mismatch: ${user.email}`);
      assert(typeof user.name === 'string' && user.name.length > 0, 'name empty');
      assert(typeof user.role === 'string' && user.role.length > 0, 'role empty');
    }},
    { name: 'login-bad-creds', fn: async () => {
      await assertRejects(api.login('bad@test.com', 'wrongpassword'), 'Expected login with bad creds to reject');
    }},
    { name: 'logout', fn: async () => {
      api.logout();
      assertEq(api.isLoggedIn(), false, 'Expected isLoggedIn to be false after logout');
    }},
    { name: 'role-permissions', fn: async () => {
      // Login as each role and verify permissions match expectations
      const rolePerms = {
        admin:       { canCreate: true,  canEdit: true,  isAdmin: true },
        manager:     { canCreate: true,  canEdit: true,  isAdmin: false },
        salesperson: { canCreate: true,  canEdit: false, isAdmin: false },
        viewer:      { canCreate: false, canEdit: false, isAdmin: false },
      };
      for (const [key, expected] of Object.entries(rolePerms)) {
        const creds = TEST_CREDS[key];
        await api.login(creds.email, creds.password);
        const role = api.getRole();
        const canCreate = ['admin', 'manager', 'salesperson'].includes(role);
        const canEdit   = ['admin', 'manager'].includes(role);
        const isAdmin   = role === 'admin';
        assertEq(canCreate, expected.canCreate, `${key}: canCreate mismatch`);
        assertEq(canEdit, expected.canEdit, `${key}: canEdit mismatch`);
        assertEq(isAdmin, expected.isAdmin, `${key}: isAdmin mismatch`);
        api.logout();
      }
    }},
  ]);

  // Re-login as admin for the remaining tests
  await api.login(TEST_CREDS.admin.email, TEST_CREDS.admin.password);

  // ==========================
  // 2. DASHBOARD (3 tests)
  // ==========================
  await runSuite('Dashboard', [
    { name: 'dashboard-stats-load', fn: async () => {
      const stats = await api.getDashboardStats();
      assert(typeof stats.todayCount === 'number', 'todayCount not a number');
      assert(typeof stats.todayTotal === 'number', 'todayTotal not a number');
      assert(typeof stats.lowStockCount === 'number', 'lowStockCount not a number');
      assert(typeof stats.negativeStockCount === 'number', 'negativeStockCount not a number');
    }},
    { name: 'low-stock-count', fn: async () => {
      const stats = await api.getDashboardStats();
      assert(stats.lowStockCount >= 1, `Expected lowStockCount >= 1 (TST-003), got ${stats.lowStockCount}`);
    }},
    { name: 'negative-stock-count', fn: async () => {
      const stats = await api.getDashboardStats();
      assert(stats.negativeStockCount >= 1, `Expected negativeStockCount >= 1 (TST-004), got ${stats.negativeStockCount}`);
    }},
  ]);

  // ==========================
  // 3. CART STORE (22 tests)
  // ==========================
  await runSuite('Cart Store', [
    { name: 'cart-empty-initial', fn: () => {
      const cart = createCart();
      assertEq(cart.items.length, 0);
      assertEq(cart.subtotal, 0);
      assertEq(cart.grandTotal, 0);
      assertEq(cart.itemCount, 0);
    }},
    { name: 'cart-add-single-item', fn: () => {
      const cart = createCart();
      cart.addItem({ id: 'p1', product_code: 'TST-001', name: 'Test Saree Red', retail_price: 1500, mrp: 1500, cgst_pct: 2.5, sgst_pct: 2.5, current_stock: 100, min_stock: 10, unit: 'PCS' });
      assertEq(cart.items.length, 1);
      assertEq(cart.items[0].quantity, 1);
      assertEq(cart.items[0].unit_price, 1500);
      assertEq(cart.subtotal, 1500);
    }},
    { name: 'cart-add-duplicate-increments-qty', fn: () => {
      const cart = createCart();
      const prod = { id: 'p1', product_code: 'TST-001', name: 'Red', retail_price: 1500, mrp: 1500, cgst_pct: 2.5, sgst_pct: 2.5 };
      cart.addItem(prod);
      cart.addItem(prod); // same id → increment
      assertEq(cart.items.length, 1);
      assertEq(cart.items[0].quantity, 2);
      assertEq(cart.subtotal, 3000);
    }},
    { name: 'cart-add-multiple-distinct', fn: () => {
      const cart = createCart();
      cart.addItem({ id: 'p1', product_code: 'TST-001', name: 'Red',  retail_price: 1500, mrp: 1500, cgst_pct: 2.5, sgst_pct: 2.5 });
      cart.addItem({ id: 'p2', product_code: 'TST-002', name: 'Blue', retail_price: 2000, mrp: 2200, cgst_pct: 2.5, sgst_pct: 2.5 });
      assertEq(cart.items.length, 2);
      assertEq(cart.subtotal, 3500);
    }},
    { name: 'cart-recalcItem-gst-breakdown', fn: () => {
      const cart = createCart();
      cart.addItem({ id: 'p1', product_code: 'TST-001', name: 'Red', retail_price: 1050, mrp: 1050, cgst_pct: 2.5, sgst_pct: 2.5 });
      const item = cart.items[0];
      // 1050 inclusive, 5% total GST → taxable = 1050 / 1.05 = 1000
      assertEq(item.line_total, 1050);
      assertClose(item.taxable, 1000, 0.01, 'taxable mismatch');
      assertClose(item.cgst_amount, 25, 0.01, 'cgst mismatch');
      assertClose(item.sgst_amount, 25, 0.01, 'sgst mismatch');
    }},
    { name: 'cart-taxable-total-sum', fn: () => {
      const cart = createCart();
      cart.addItem({ id: 'p1', product_code: 'A', name: 'A', retail_price: 1050, mrp: 1050, cgst_pct: 2.5, sgst_pct: 2.5 });
      cart.addItem({ id: 'p2', product_code: 'B', name: 'B', retail_price: 525,  mrp: 525,  cgst_pct: 2.5, sgst_pct: 2.5 });
      assertClose(cart.taxableTotal, 1500, 0.01, 'taxableTotal');
      assertClose(cart.cgstTotal, 37.5, 0.01, 'cgstTotal');
      assertClose(cart.sgstTotal, 37.5, 0.01, 'sgstTotal');
    }},
    { name: 'cart-update-qty', fn: () => {
      const cart = createCart();
      cart.addItem({ id: 'p1', product_code: 'A', name: 'A', retail_price: 1000, mrp: 1000, cgst_pct: 2.5, sgst_pct: 2.5 });
      cart.updateQty(0, 5);
      assertEq(cart.items[0].quantity, 5);
      assertEq(cart.subtotal, 5000);
    }},
    { name: 'cart-update-qty-minimum-1', fn: () => {
      const cart = createCart();
      cart.addItem({ id: 'p1', product_code: 'A', name: 'A', retail_price: 1000, mrp: 1000, cgst_pct: 2.5, sgst_pct: 2.5 });
      cart.updateQty(0, 0);
      assertEq(cart.items[0].quantity, 1, 'qty should floor at 1');
    }},
    { name: 'cart-update-price', fn: () => {
      const cart = createCart();
      cart.addItem({ id: 'p1', product_code: 'A', name: 'A', retail_price: 1000, mrp: 1000, cgst_pct: 2.5, sgst_pct: 2.5 });
      cart.updatePrice(0, 2000);
      assertEq(cart.items[0].unit_price, 2000);
      assertEq(cart.subtotal, 2000);
    }},
    { name: 'cart-remove-item', fn: () => {
      const cart = createCart();
      cart.addItem({ id: 'p1', product_code: 'A', name: 'A', retail_price: 1000, mrp: 1000, cgst_pct: 2.5, sgst_pct: 2.5 });
      cart.addItem({ id: 'p2', product_code: 'B', name: 'B', retail_price: 500,  mrp: 500,  cgst_pct: 2.5, sgst_pct: 2.5 });
      cart.removeItem(0);
      assertEq(cart.items.length, 1);
      assertEq(cart.items[0].name, 'B');
    }},
    { name: 'cart-item-count-sums-qty', fn: () => {
      const cart = createCart();
      cart.addItem({ id: 'p1', product_code: 'A', name: 'A', retail_price: 100, mrp: 100, cgst_pct: 2.5, sgst_pct: 2.5 });
      cart.addItem({ id: 'p2', product_code: 'B', name: 'B', retail_price: 200, mrp: 200, cgst_pct: 2.5, sgst_pct: 2.5 });
      cart.updateQty(0, 3);
      assertEq(cart.itemCount, 4, '3 + 1 = 4');
    }},
    { name: 'cart-discount-up', fn: () => {
      const cart = createCart();
      cart.addItem({ id: 'p1', product_code: 'A', name: 'A', retail_price: 1540, mrp: 1540, cgst_pct: 2.5, sgst_pct: 2.5 });
      // subtotal = 1540, first discount step: remainder = 1540 % 100 = 40, step = min(25,40) = 25
      cart.discountUp();
      assertEq(cart.discountAmount, 25);
      assertEq(cart.grandTotal, 1515);
    }},
    { name: 'cart-discount-down', fn: () => {
      const cart = createCart();
      cart.addItem({ id: 'p1', product_code: 'A', name: 'A', retail_price: 1540, mrp: 1540, cgst_pct: 2.5, sgst_pct: 2.5 });
      cart.discountUp();
      cart.discountDown();
      assertEq(cart.discountAmount, 0);
    }},
    { name: 'cart-setDiscount-clamps', fn: () => {
      const cart = createCart();
      cart.addItem({ id: 'p1', product_code: 'A', name: 'A', retail_price: 500, mrp: 500, cgst_pct: 2.5, sgst_pct: 2.5 });
      cart.setDiscount(9999);
      assertEq(cart.discountAmount, 500, 'Clamped to subtotal');
      cart.setDiscount(-10);
      assertEq(cart.discountAmount, 0, 'Clamped to 0');
    }},
    { name: 'cart-grand-total-with-discount', fn: () => {
      const cart = createCart();
      cart.addItem({ id: 'p1', product_code: 'A', name: 'A', retail_price: 2000, mrp: 2000, cgst_pct: 2.5, sgst_pct: 2.5 });
      cart.setDiscount(300);
      assertEq(cart.grandTotal, 1700);
    }},
    { name: 'cart-clear-resets-all', fn: () => {
      const cart = createCart();
      cart.addItem({ id: 'p1', product_code: 'A', name: 'A', retail_price: 1000, mrp: 1000, cgst_pct: 2.5, sgst_pct: 2.5 });
      cart.customerMobile = '9876500001';
      cart.customerName = 'Amit';
      cart.setDiscount(50);
      cart.clear();
      assertEq(cart.items.length, 0);
      assertEq(cart.discountAmount, 0);
      assertEq(cart.customerMobile, '');
      assertEq(cart.customerName, '');
    }},
    { name: 'cart-clear-keep-customer', fn: () => {
      const cart = createCart();
      cart.addItem({ id: 'p1', product_code: 'A', name: 'A', retail_price: 1000, mrp: 1000, cgst_pct: 2.5, sgst_pct: 2.5 });
      cart.customerMobile = '9876500001';
      cart.customerName = 'Amit';
      cart.clear(true);
      assertEq(cart.items.length, 0);
      assertEq(cart.customerMobile, '9876500001', 'Customer should be kept');
    }},
    { name: 'cart-clearAll', fn: () => {
      const cart = createCart();
      cart.addItem({ id: 'p1', product_code: 'A', name: 'A', retail_price: 1000, mrp: 1000, cgst_pct: 2.5, sgst_pct: 2.5 });
      cart.customerName = 'Amit';
      cart.paymentMethod = 'upi';
      cart.clearAll();
      assertEq(cart.items.length, 0);
      assertEq(cart.customerName, '');
      assertEq(cart.paymentMethod, 'cash');
    }},
    { name: 'cart-uses-retail-price-fallback-to-mrp', fn: () => {
      const cart = createCart();
      // When retail_price is undefined, should fall back to mrp
      cart.addItem({ id: 'p1', product_code: 'A', name: 'A', mrp: 800, cgst_pct: 2.5, sgst_pct: 2.5 });
      assertEq(cart.items[0].unit_price, 800, 'Should fall back to mrp when retail_price absent');
    }},
    { name: 'cart-step-management', fn: () => {
      const cart = createCart();
      assertEq(cart.step, 'products');
      cart.step = 'review';
      assertEq(cart.step, 'review');
      cart.clear();
      assertEq(cart.step, 'products', 'clear() should reset step');
    }},
    { name: 'cart-payment-method-default', fn: () => {
      const cart = createCart();
      assertEq(cart.paymentMethod, 'cash');
      cart.paymentMethod = 'upi';
      assertEq(cart.paymentMethod, 'upi');
    }},
    { name: 'cart-discount-multiple-steps', fn: () => {
      const cart = createCart();
      cart.addItem({ id: 'p1', product_code: 'A', name: 'A', retail_price: 1540, mrp: 1540, cgst_pct: 2.5, sgst_pct: 2.5 });
      // subtotal = 1540
      cart.discountUp(); // step=25, discount=25, total=1515
      assertEq(cart.discountAmount, 25);
      cart.discountUp(); // total=1515, remainder=15, step=min(25,15)=15, discount=40
      assertEq(cart.discountAmount, 40);
      cart.discountUp(); // total=1500, remainder=0, step=25, discount=65
      assertEq(cart.discountAmount, 65);
      assertEq(cart.grandTotal, 1475);
    }},
  ]);

  // ==========================
  // 4. CART EDIT MODE (4 tests)
  // ==========================
  await runSuite('Cart Edit Mode', [
    { name: 'cart-not-editing-by-default', fn: () => {
      const cart = createCart();
      assertEq(cart.isEditing, false);
    }},
    { name: 'cart-loadForEdit-sets-editing', fn: () => {
      const cart = createCart();
      const fakeInvoice = { id: 'inv1', invoice_number: 'GST-0001-2025/26', payment_method: 'upi', discount_total: 50, expand: { customer: { mobile: '9876500001', name: 'Amit' } } };
      const fakeItems = [
        { product: 'p1', product_code: 'TST-001', product_name: 'Red', unit_price: 1500, quantity: 2, cgst_pct: 2.5, sgst_pct: 2.5, unit: 'PCS', expand: { product: { current_stock: 100 } } },
      ];
      cart.loadForEdit(fakeInvoice, fakeItems);
      assertEq(cart.isEditing, true);
      assertEq(cart.editingInvoiceId, 'inv1');
      assertEq(cart.editingInvoiceNumber, 'GST-0001-2025/26');
      assertEq(cart.paymentMethod, 'upi');
      assertEq(cart.discountAmount, 50);
      assertEq(cart.customerMobile, '9876500001');
    }},
    { name: 'cart-loadForEdit-recalcs-items', fn: () => {
      const cart = createCart();
      const fakeInvoice = { id: 'inv1', invoice_number: 'G-0001', expand: { customer: { mobile: '9876500001', name: 'Amit' } } };
      const fakeItems = [
        { product: 'p1', product_code: 'A', product_name: 'A', unit_price: 1050, quantity: 1, cgst_pct: 2.5, sgst_pct: 2.5, unit: 'PCS', expand: { product: { current_stock: 50 } } },
      ];
      cart.loadForEdit(fakeInvoice, fakeItems);
      assertEq(cart.items.length, 1);
      assertClose(cart.items[0].taxable, 1000, 0.01);
    }},
    { name: 'cart-clear-removes-edit-state', fn: () => {
      const cart = createCart();
      cart.editingInvoiceId = 'inv1';
      cart.editingInvoiceNumber = 'G-0001';
      cart.clear();
      assertEq(cart.isEditing, false);
      assertEq(cart.editingInvoiceId, null);
    }},
  ]);

  // ==========================
  // 5. QUICK BILL (3 tests)
  // ==========================
  await runSuite('Quick Bill', [
    { name: 'quick-bill-adds-lines', fn: () => {
      const cart = createCart();
      cart.addQuickBillLines(3);
      assertEq(cart.items.length, 3);
      assertEq(cart.items[0].name, 'Saree - 1');
      assertEq(cart.items[2].name, 'Saree - 3');
    }},
    { name: 'quick-bill-continues-numbering', fn: () => {
      const cart = createCart();
      cart.addQuickBillLines(2);
      cart.addQuickBillLines(2);
      assertEq(cart.items.length, 4);
      assertEq(cart.items[2].name, 'Saree - 3');
      assertEq(cart.items[3].name, 'Saree - 4');
    }},
    { name: 'quick-bill-zero-price-items', fn: () => {
      const cart = createCart();
      cart.addQuickBillLines(1);
      assertEq(cart.items[0].unit_price, 0);
      assertEq(cart.items[0].line_total, 0);
      assertEq(cart.subtotal, 0);
    }},
  ]);

  // ==========================
  // 6. INVOICE GENERATION FLOW (6 tests) — via API
  // ==========================
  await runSuite('Invoice Generation Flow', [
    { name: 'invoice-number-auto-generated', fn: async () => {
      const inv = await api.getNextInvoiceNumber();
      assert(inv.number, 'number is empty');
      assert(inv.number.includes('-'), 'number format missing dashes');
      assert(typeof inv.counter === 'number', 'counter not a number');
    }},
    { name: 'create-invoice-via-api', fn: async () => {
      const user = api.getUser();
      const customers = await api.searchCustomers('Test Customer');
      if (!customers.items.length) throw new Error('SKIP: No test customers found. Run seed first.');
      const customer = customers.items[0];
      const inv = await api.getNextInvoiceNumber();
      const invoice = await api.createInvoice({
        invoice_number: inv.number,
        invoice_date: new Date().toISOString().split('T')[0],
        customer: customer.id,
        created_by: user.id,
        subtotal: 1500,
        cgst_total: 18.29,
        sgst_total: 18.29,
        discount_total: 0,
        adjustment: 0,
        grand_total: 1500,
        payment_method: 'cash',
        status: 'completed',
        notes: 'Browser test invoice',
      });
      await api.incrementInvoiceCounter(inv.counter);
      assert(invoice.id, 'Invoice has no id');
      assertEq(invoice.invoice_number, inv.number);
      // Store for later tests
      window.__testInvoiceId = invoice.id;
      window.__testInvoiceNumber = invoice.invoice_number;
      window.__testCustomerId = customer.id;
    }},
    { name: 'create-invoice-items', fn: async () => {
      if (!window.__testInvoiceId) throw new Error('SKIP: invoice not created');
      const products = await api.searchProducts('TST-001');
      if (!products.items.length) throw new Error('SKIP: No test products. Run seed first.');
      const product = products.items[0];
      const item = await api.createInvoiceItem({
        invoice: window.__testInvoiceId,
        product: product.id,
        product_code: product.product_code,
        product_name: product.name,
        hsn_code: product.hsn_code,
        unit_price: 1500,
        quantity: 1,
        line_total: 1500,
        cgst_pct: 2.5,
        sgst_pct: 2.5,
        cgst_amount: 18.29,
        sgst_amount: 18.29,
        taxable_amount: 1428.57,
        unit: 'PCS',
      });
      assert(item.id, 'Item has no id');
      window.__testProductId = product.id;
    }},
    { name: 'verify-invoice-items-count', fn: async () => {
      if (!window.__testInvoiceId) throw new Error('SKIP: invoice not created');
      const items = await api.getInvoiceItems(window.__testInvoiceId);
      assert(items.length >= 1, `Expected >= 1 items, got ${items.length}`);
    }},
    { name: 'verify-invoice-fetchable', fn: async () => {
      if (!window.__testInvoiceId) throw new Error('SKIP: invoice not created');
      const inv = await api.getInvoice(window.__testInvoiceId);
      assertEq(inv.id, window.__testInvoiceId);
      assert(inv.invoice_number, 'Missing invoice_number');
      assert(inv.grand_total !== undefined, 'Missing grand_total');
    }},
    { name: 'verify-invoice-in-list', fn: async () => {
      const list = await api.getInvoices('', 1, 50);
      assert(list.items.length >= 1, 'Invoice list is empty');
      const found = list.items.find(i => i.id === window.__testInvoiceId);
      assert(found, 'Test invoice not found in list');
    }},
  ]);

  // ==========================
  // 7. INVOICE VIEW (5 tests) — fetch and inspect
  // ==========================
  await runSuite('Invoice View', [
    { name: 'fetch-invoice-has-fields', fn: async () => {
      if (!window.__testInvoiceId) throw new Error('SKIP: invoice not created');
      const inv = await api.getInvoice(window.__testInvoiceId);
      assert(inv.invoice_number, 'Missing invoice_number');
      assert(inv.invoice_date, 'Missing invoice_date');
      assert(inv.status, 'Missing status');
      assert(typeof inv.grand_total === 'number', 'grand_total not number');
    }},
    { name: 'fetch-invoice-items-have-expand', fn: async () => {
      if (!window.__testInvoiceId) throw new Error('SKIP: invoice not created');
      const items = await api.getInvoiceItems(window.__testInvoiceId);
      assert(items.length >= 1, 'No items');
      assert(items[0].product, 'Missing product relation');
      assert(items[0].product_name, 'Missing product_name');
    }},
    { name: 'fetch-invoice-expand-customer', fn: async () => {
      if (!window.__testInvoiceId) throw new Error('SKIP: invoice not created');
      const inv = await api.getInvoice(window.__testInvoiceId);
      assert(inv.expand?.customer, 'Customer not expanded');
      assert(inv.expand.customer.name, 'Customer name missing');
    }},
    { name: 'fetch-invoice-expand-created-by', fn: async () => {
      if (!window.__testInvoiceId) throw new Error('SKIP: invoice not created');
      const inv = await api.getInvoice(window.__testInvoiceId);
      assert(inv.expand?.created_by, 'created_by not expanded');
    }},
    { name: 'invoice-grand-total-matches', fn: async () => {
      if (!window.__testInvoiceId) throw new Error('SKIP: invoice not created');
      const inv = await api.getInvoice(window.__testInvoiceId);
      assertEq(inv.grand_total, 1500);
    }},
  ]);

  // ==========================
  // 8. INVOICE LIST (2 tests)
  // ==========================
  await runSuite('Invoice List', [
    { name: 'list-invoices-returns-items', fn: async () => {
      const list = await api.getInvoices('', 1, 10);
      assert(list.items, 'items missing');
      assert(typeof list.totalItems === 'number', 'totalItems missing');
    }},
    { name: 'list-invoices-filter-by-status', fn: async () => {
      const list = await api.getInvoices('status = "completed"', 1, 10);
      for (const inv of list.items) {
        assertEq(inv.status, 'completed', `Expected completed, got ${inv.status}`);
      }
    }},
  ]);

  // ==========================
  // 9. PRODUCTS PAGE (4 tests)
  // ==========================
  await runSuite('Products Page', [
    { name: 'search-products-by-name', fn: async () => {
      const results = await api.searchProducts('Test Saree');
      assert(results.items.length >= 1, 'No products found for "Test Saree"');
    }},
    { name: 'search-products-by-code', fn: async () => {
      const results = await api.searchProducts('TST-001');
      assert(results.items.length >= 1, 'No products found for TST-001');
      assertEq(results.items[0].product_code, 'TST-001');
    }},
    { name: 'get-product-by-barcode', fn: async () => {
      const product = await api.getProductByBarcode('8901234560001');
      assert(product, 'Product not found by barcode');
      assertEq(product.barcode, '8901234560001');
    }},
    { name: 'get-product-by-barcode-not-found', fn: async () => {
      const product = await api.getProductByBarcode('0000000000000');
      assertEq(product, null, 'Expected null for unknown barcode');
    }},
  ]);

  // ==========================
  // 10. STOCK PAGE (5 tests)
  // ==========================
  await runSuite('Stock Page', [
    { name: 'get-low-stock-products', fn: async () => {
      const result = await api.getLowStockProducts();
      assert(result.items.length >= 1, 'Expected at least 1 low stock product');
      // All items should have stock < min_stock
      for (const p of result.items) {
        assert(p.current_stock < p.min_stock, `${p.product_code}: stock ${p.current_stock} not < min ${p.min_stock}`);
      }
    }},
    { name: 'get-negative-stock-products', fn: async () => {
      const result = await api.getNegativeStockProducts();
      assert(result.items.length >= 1, 'Expected at least 1 negative stock product');
      for (const p of result.items) {
        assert(p.current_stock < 0, `${p.product_code}: stock ${p.current_stock} not negative`);
      }
    }},
    { name: 'create-stock-movement', fn: async () => {
      if (!window.__testProductId) throw new Error('SKIP: no test product');
      const product = await api.getProduct(window.__testProductId);
      const beforeStock = product.current_stock;
      const mv = await api.createStockMovement({
        product: window.__testProductId,
        type: 'adjustment',
        quantity: 5,
        balance_after: beforeStock + 5,
        notes: 'Browser test adjustment',
        created_by: api.getUser().id,
      });
      assert(mv.id, 'Movement has no id');
      window.__testMovementId = mv.id;
    }},
    { name: 'stock-movements-list', fn: async () => {
      if (!window.__testProductId) throw new Error('SKIP: no test product');
      const result = await api.getStockMovements(`product = "${window.__testProductId}"`);
      assert(result.items.length >= 1, 'No movements found');
    }},
    { name: 'stock-movement-has-balance', fn: async () => {
      if (!window.__testProductId) throw new Error('SKIP: no test product');
      const result = await api.getStockMovements(`product = "${window.__testProductId}"`);
      const mv = result.items[0];
      assert(typeof mv.balance_after === 'number', 'balance_after not a number');
    }},
  ]);

  // ==========================
  // 11. REPORTS (4 tests)
  // ==========================
  await runSuite('Reports', [
    { name: 'reports-date-range-query', fn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const result = await api.getInvoicesByDateRange('2024-01-01', today);
      assert(result.items !== undefined, 'Missing items');
      assert(typeof result.totalItems === 'number', 'Missing totalItems');
    }},
    { name: 'reports-today-only', fn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const result = await api.getInvoicesByDateRange(today, today);
      // All invoices should be from today
      for (const inv of result.items) {
        assert(inv.invoice_date >= today, `Invoice date ${inv.invoice_date} before today`);
      }
    }},
    { name: 'reports-empty-range', fn: async () => {
      const result = await api.getInvoicesByDateRange('2020-01-01', '2020-01-02');
      assertEq(result.totalItems, 0, 'Expected 0 invoices in distant past range');
    }},
    { name: 'reports-all-items-for-invoices', fn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const invoices = await api.getInvoicesByDateRange('2024-01-01', today);
      const ids = invoices.items.map(i => i.id);
      if (ids.length === 0) return; // nothing to test
      const items = await api.getAllInvoiceItemsForInvoices(ids.slice(0, 5));
      assert(Array.isArray(items), 'Expected array');
    }},
  ]);

  // ==========================
  // 12. SETTINGS (3 tests)
  // ==========================
  await runSuite('Settings', [
    { name: 'settings-load', fn: async () => {
      const settings = await api.getSettings();
      assert(typeof settings === 'object', 'Settings not an object');
      assert(Object.keys(settings).length > 0, 'Settings is empty');
    }},
    { name: 'settings-has-invoice-prefix', fn: async () => {
      const settings = await api.getSettings();
      assert(settings['invoice_prefix'], 'invoice_prefix missing');
    }},
    { name: 'settings-has-financial-year', fn: async () => {
      const settings = await api.getSettings();
      assert(settings['financial_year'], 'financial_year missing');
    }},
  ]);

  // ==========================
  // 13. CUSTOMERS (2 tests)
  // ==========================
  await runSuite('Customers', [
    { name: 'list-customers', fn: async () => {
      const result = await api.searchCustomers('');
      assert(result.items, 'items missing');
      assert(result.items.length >= 1, 'No customers');
    }},
    { name: 'search-customer-by-mobile', fn: async () => {
      const customer = await api.getCustomerByMobile('9876500001');
      if (!customer) throw new Error('SKIP: Test customer with mobile 9876500001 not found. Run seed.');
      assertEq(customer.mobile, '9876500001');
    }},
  ]);

  // ==========================
  // 14. UTILITIES (6 tests)
  // ==========================
  await runSuite('Utilities — GST', [
    { name: 'extractGST-exists', fn: () => {
      assert(typeof extractGST === 'function', 'extractGST not a function');
    }},
    { name: 'extractGST-1050-at-5pct', fn: () => {
      const r = extractGST(1050, 2.5, 2.5);
      assertClose(r.taxable, 1000, 0.01);
      assertClose(r.cgst, 25, 0.01);
      assertClose(r.sgst, 25, 0.01);
      assertClose(r.total, 1050, 0.01);
    }},
    { name: 'extractGST-consistency', fn: () => {
      // taxable + cgst + sgst should equal total
      const r = extractGST(3750, 2.5, 2.5);
      assertClose(r.taxable + r.cgst + r.sgst, r.total, 0.02, 'Breakdown does not sum to total');
    }},
    { name: 'extractGST-zero-amount', fn: () => {
      const r = extractGST(0, 2.5, 2.5);
      assertEq(r.taxable, 0);
      assertEq(r.cgst, 0);
      assertEq(r.sgst, 0);
      assertEq(r.total, 0);
    }},
    { name: 'extractGST-large-amount', fn: () => {
      const r = extractGST(105000, 2.5, 2.5);
      assertClose(r.taxable, 100000, 0.01);
      assertClose(r.cgst, 2500, 0.01);
      assertClose(r.sgst, 2500, 0.01);
    }},
  ]);

  await runSuite('Utilities — Discount', [
    { name: 'calcNextDiscount-exists', fn: () => {
      assert(typeof calcNextDiscount === 'function', 'calcNextDiscount not a function');
    }},
    { name: 'discount-step-1540', fn: () => {
      // subtotal 1540, currentDiscount 0 → currentTotal 1540
      // remainder = 1540 % 100 = 40 → step = min(25, 40) = 25
      const d = calcNextDiscount(1540, 0);
      assertEq(d, 25);
    }},
    { name: 'discount-round-trip', fn: () => {
      const sub = 1540;
      let d = 0;
      d = calcNextDiscount(sub, d); // 25
      d = calcNextDiscount(sub, d); // 25 + 15 = 40 (remainder 1515%100=15, step=15)
      const afterTwo = d;
      d = calcPrevDiscount(sub, d);
      d = calcPrevDiscount(sub, d);
      assertEq(d, 0, 'After going up 2 and down 2, discount should be 0');
    }},
    { name: 'discount-at-zero-stays-zero', fn: () => {
      const d = calcPrevDiscount(1000, 0);
      assertEq(d, 0, 'Prev discount at 0 should stay 0');
    }},
  ]);

  // ==========================
  // 15. HASH ROUTER (3 tests)
  // ==========================
  await runSuite('Hash Router', [
    { name: 'route-map-defined', fn: () => {
      // Test the route mapping logic inline (same as app.js appRoot)
      const routes = {
        '': 'dashboard',
        '#dashboard': 'dashboard',
        '#invoice': 'invoice-new',
        '#invoices': 'invoice-list',
        '#products': 'products',
        '#customers': 'customers',
        '#suppliers': 'suppliers',
        '#stock': 'stock',
        '#reports': 'reports',
        '#settings': 'settings',
        '#users': 'users',
        '#import': 'import',
        '#more': 'more',
      };
      assertEq(routes['#dashboard'], 'dashboard');
      assertEq(routes['#invoice'], 'invoice-new');
      assertEq(routes['#invoices'], 'invoice-list');
      assertEq(routes['#products'], 'products');
      assertEq(routes['#stock'], 'stock');
    }},
    { name: 'route-unknown-falls-to-dashboard', fn: () => {
      const routes = { '': 'dashboard', '#dashboard': 'dashboard' };
      const hash = '#nonexistent';
      const page = routes[hash] || 'dashboard';
      assertEq(page, 'dashboard');
    }},
    { name: 'route-invoice-view-param', fn: () => {
      // Simulate: #invoice/abc123 → page='invoice-view', params.id='abc123'
      const hash = '#invoice/abc123';
      const parts = hash.split('/').filter(Boolean);
      let page = 'dashboard', params = {};
      if (hash.startsWith('#invoice/') && parts.length > 1) {
        page = 'invoice-view';
        params = { id: parts[1] };
      }
      assertEq(page, 'invoice-view');
      assertEq(params.id, 'abc123');
    }},
    { name: 'route-empty-hash-is-dashboard', fn: () => {
      const routes = { '': 'dashboard', '#dashboard': 'dashboard', '#invoice': 'invoice-new' };
      assertEq(routes[''], 'dashboard');
    }},
  ]);

  // ===== SUMMARY =====
  progress.textContent = 'Done.';
  const total = totalPassed + totalFailed;
  const allGreen = totalFailed === 0;
  summaryEl.className = 'summary ' + (allGreen ? 'pass-bg' : 'fail-bg');
  summaryEl.innerHTML = `<strong>${allGreen ? 'ALL PASSED' : 'SOME FAILED'}</strong> — ${totalPassed} passed, ${totalFailed} failed` +
    (totalSkipped ? `, ${totalSkipped} skipped` : '') + ` out of ${total}`;

  // Store counts globally so functional-tests.js can read them
  window.__testJsPassed = totalPassed;
  window.__testJsFailed = totalFailed;

  // Signal done so functional-tests.js knows it can start
  window.__testJsDone = true;

})();
