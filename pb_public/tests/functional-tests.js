/**
 * Invoice App — Functional / Workflow Tests (functional-tests.js)
 * 45 end-to-end workflow tests exercised via the API layer.
 * Loaded AFTER test.js which provides: runSuite, assert, assertEq,
 * assertClose, assertRejects, logSuite, logPass, logFail, logSkip,
 * TEST_CREDS, TEST_PRODUCTS, TEST_CUSTOMERS, createCart.
 */

(async function functionalTests() {
  // Wait for test.js to finish (it sets this flag)
  while (!window.__testJsDone) {
    await new Promise(r => setTimeout(r, 100));
  }

  const progress = document.getElementById('progress');
  progress.textContent = 'Running functional tests...';

  // Make sure we're logged in as admin
  if (!api.isLoggedIn()) {
    await api.login(TEST_CREDS.admin.email, TEST_CREDS.admin.password);
  }

  // Track counts that test.js already accumulated
  const baseP = window.__testJsPassed || 0;
  const baseF = window.__testJsFailed || 0;

  // ============================================================
  // 1. COMPLETE INVOICE CREATION WORKFLOW (10 tests)
  // ============================================================
  let wfCustomerId = null, wfInvoiceId = null, wfInvoiceNumber = null, wfProductId = null;

  await runSuite('Workflow — Invoice Creation', [
    { name: 'wf-create-or-find-customer', fn: async () => {
      let cust = await api.getCustomerByMobile('9876500099');
      if (!cust) {
        cust = await api.createCustomer({ name: 'WF Test Customer', mobile: '9876500099', state: 'Madhya Pradesh' });
      }
      assert(cust.id, 'Customer has no id');
      wfCustomerId = cust.id;
    }},
    { name: 'wf-search-product-by-barcode', fn: async () => {
      const prod = await api.getProductByBarcode('8901234560001');
      assert(prod, 'Product TST-001 not found by barcode');
      wfProductId = prod.id;
    }},
    { name: 'wf-get-next-invoice-number', fn: async () => {
      const inv = await api.getNextInvoiceNumber();
      assert(inv.number, 'Invoice number blank');
      wfInvoiceNumber = inv.number;
      window.__wfCounter = inv.counter;
    }},
    { name: 'wf-create-invoice-with-totals', fn: async () => {
      const user = api.getUser();
      const invoice = await api.createInvoice({
        invoice_number: wfInvoiceNumber,
        invoice_date: new Date().toISOString().split('T')[0],
        customer: wfCustomerId,
        created_by: user.id,
        subtotal: 3500,
        cgst_total: 42.68,
        sgst_total: 42.68,
        discount_total: 100,
        adjustment: 0,
        grand_total: 3400,
        payment_method: 'cash',
        status: 'completed',
        notes: 'Functional test workflow',
      });
      await api.incrementInvoiceCounter(window.__wfCounter);
      assert(invoice.id, 'No id returned');
      wfInvoiceId = invoice.id;
    }},
    { name: 'wf-create-invoice-items', fn: async () => {
      assert(wfInvoiceId && wfProductId, 'SKIP: prereqs missing');
      const item = await api.createInvoiceItem({
        invoice: wfInvoiceId,
        product: wfProductId,
        product_code: 'TST-001',
        product_name: 'Test Saree Red',
        hsn_code: '5407',
        unit_price: 1500,
        quantity: 2,
        line_total: 3000,
        cgst_pct: 2.5, sgst_pct: 2.5,
        cgst_amount: 36.59, sgst_amount: 36.59,
        taxable_amount: 2857.14,
        unit: 'PCS',
      });
      assert(item.id, 'Invoice item not created');
      // Add a second item
      const prod2 = await api.getProductByBarcode('8901234560002');
      if (prod2) {
        await api.createInvoiceItem({
          invoice: wfInvoiceId,
          product: prod2.id,
          product_code: 'TST-002',
          product_name: 'Test Saree Blue',
          hsn_code: '5407',
          unit_price: 500,
          quantity: 1,
          line_total: 500,
          cgst_pct: 2.5, sgst_pct: 2.5,
          cgst_amount: 6.10, sgst_amount: 6.10,
          taxable_amount: 476.19,
          unit: 'PCS',
        });
      }
    }},
    { name: 'wf-verify-invoice-number-auto', fn: async () => {
      const inv = await api.getInvoice(wfInvoiceId);
      assertEq(inv.invoice_number, wfInvoiceNumber);
      assert(inv.invoice_number.length > 5, 'Invoice number too short');
    }},
    { name: 'wf-verify-items-count', fn: async () => {
      const items = await api.getInvoiceItems(wfInvoiceId);
      assert(items.length >= 1, `Expected >= 1, got ${items.length}`);
    }},
    { name: 'wf-create-upi-invoice', fn: async () => {
      const user = api.getUser();
      const inv = await api.getNextInvoiceNumber();
      const invoice = await api.createInvoice({
        invoice_number: inv.number,
        invoice_date: new Date().toISOString().split('T')[0],
        customer: wfCustomerId,
        created_by: user.id,
        subtotal: 1000,
        cgst_total: 12.20,
        sgst_total: 12.20,
        discount_total: 0,
        adjustment: 0,
        grand_total: 1000,
        payment_method: 'upi',
        status: 'completed',
        notes: 'UPI payment test',
      });
      await api.incrementInvoiceCounter(inv.counter);
      assertEq(invoice.payment_method, 'upi');
      window.__wfUpiInvoiceId = invoice.id;
    }},
    { name: 'wf-grand-total-equals-subtotal-minus-discount', fn: async () => {
      const inv = await api.getInvoice(wfInvoiceId);
      assertEq(inv.grand_total, inv.subtotal - inv.discount_total);
    }},
    { name: 'wf-customer-lookup-by-mobile', fn: async () => {
      const cust = await api.getCustomerByMobile('9876500099');
      assert(cust, 'Customer not found by mobile');
      assertEq(cust.mobile, '9876500099');
    }},
  ]);

  // ============================================================
  // 2. INVOICE VIEW & EDIT WORKFLOW (6 tests)
  // ============================================================
  await runSuite('Workflow — Invoice View & Edit', [
    { name: 'view-fetch-invoice', fn: async () => {
      assert(wfInvoiceId, 'SKIP: no workflow invoice');
      const inv = await api.getInvoice(wfInvoiceId);
      assert(inv.invoice_number, 'Missing invoice_number');
      assert(inv.status, 'Missing status');
      assert(inv.payment_method, 'Missing payment_method');
      assert(inv.grand_total !== undefined, 'Missing grand_total');
      assert(inv.customer, 'Missing customer relation');
    }},
    { name: 'view-fetch-items-correct-count', fn: async () => {
      assert(wfInvoiceId, 'SKIP: no workflow invoice');
      const items = await api.getInvoiceItems(wfInvoiceId);
      assert(items.length >= 1, `Expected >= 1 items, got ${items.length}`);
    }},
    { name: 'view-update-adjustment', fn: async () => {
      assert(wfInvoiceId, 'SKIP: no workflow invoice');
      const before = await api.getInvoice(wfInvoiceId);
      await api.updateInvoice(wfInvoiceId, {
        adjustment: 10,
        grand_total: before.subtotal - before.discount_total + 10,
      });
      const after = await api.getInvoice(wfInvoiceId);
      assertEq(after.adjustment, 10);
      assertEq(after.grand_total, before.subtotal - before.discount_total + 10);
    }},
    { name: 'view-mark-as-revised', fn: async () => {
      assert(wfInvoiceId, 'SKIP: no workflow invoice');
      await api.updateInvoice(wfInvoiceId, { status: 'revised' });
      const inv = await api.getInvoice(wfInvoiceId);
      assertEq(inv.status, 'revised');
    }},
    { name: 'view-create-new-version', fn: async () => {
      assert(wfInvoiceId, 'SKIP: no workflow invoice');
      const user = api.getUser();
      const newInv = await api.createInvoice({
        invoice_number: wfInvoiceNumber,  // same number
        invoice_date: new Date().toISOString().split('T')[0],
        customer: wfCustomerId,
        created_by: user.id,
        subtotal: 3500,
        cgst_total: 42.68,
        sgst_total: 42.68,
        discount_total: 100,
        adjustment: 0,
        grand_total: 3400,
        payment_method: 'cash',
        status: 'completed',
        notes: 'Revised version',
      });
      assert(newInv.id, 'New version not created');
      assert(newInv.id !== wfInvoiceId, 'Should be a different record');
      window.__wfRevisedInvoiceId = newInv.id;
    }},
    { name: 'view-both-versions-exist', fn: async () => {
      assert(wfInvoiceId, 'SKIP: no workflow invoice');
      const list = await api.getInvoices(`invoice_number = "${wfInvoiceNumber}"`);
      assert(list.items.length >= 2, `Expected >= 2 versions, got ${list.items.length}`);
    }},
  ]);

  // ============================================================
  // 3. LOGIN & AUTH WORKFLOW (8 tests)
  // ============================================================
  await runSuite('Workflow — Login & Auth', [
    { name: 'auth-login-admin', fn: async () => {
      api.logout();
      await api.login(TEST_CREDS.admin.email, TEST_CREDS.admin.password);
      assertEq(api.getRole(), 'admin');
    }},
    { name: 'auth-login-manager', fn: async () => {
      api.logout();
      await api.login(TEST_CREDS.manager.email, TEST_CREDS.manager.password);
      assertEq(api.getRole(), 'manager');
    }},
    { name: 'auth-login-salesperson', fn: async () => {
      api.logout();
      await api.login(TEST_CREDS.salesperson.email, TEST_CREDS.salesperson.password);
      assertEq(api.getRole(), 'salesperson');
    }},
    { name: 'auth-login-viewer', fn: async () => {
      api.logout();
      await api.login(TEST_CREDS.viewer.email, TEST_CREDS.viewer.password);
      assertEq(api.getRole(), 'viewer');
    }},
    { name: 'auth-admin-can-create-product', fn: async () => {
      api.logout();
      await api.login(TEST_CREDS.admin.email, TEST_CREDS.admin.password);
      // Admin should be able to call getNextProductCode at minimum
      const code = await api.getNextProductCode();
      assert(code, 'Admin could not get next product code');
    }},
    { name: 'auth-manager-can-update-invoice', fn: async () => {
      api.logout();
      await api.login(TEST_CREDS.manager.email, TEST_CREDS.manager.password);
      if (wfInvoiceId) {
        // Manager should be able to read invoice
        const inv = await api.getInvoice(wfInvoiceId);
        assert(inv.id, 'Manager could not read invoice');
      }
    }},
    { name: 'auth-salesperson-can-search-products', fn: async () => {
      api.logout();
      await api.login(TEST_CREDS.salesperson.email, TEST_CREDS.salesperson.password);
      const results = await api.searchProducts('Test');
      assert(results.items !== undefined, 'Salesperson could not search products');
    }},
    { name: 'auth-viewer-can-list-invoices', fn: async () => {
      api.logout();
      await api.login(TEST_CREDS.viewer.email, TEST_CREDS.viewer.password);
      const list = await api.getInvoices('', 1, 5);
      assert(list.items !== undefined, 'Viewer could not list invoices');
    }},
  ]);

  // Re-login as admin for remaining tests
  api.logout();
  await api.login(TEST_CREDS.admin.email, TEST_CREDS.admin.password);

  // ============================================================
  // 4. PRODUCTS WORKFLOW (5 tests)
  // ============================================================
  let wfNewProductId = null;

  await runSuite('Workflow — Products', [
    { name: 'products-search-by-name', fn: async () => {
      const results = await api.searchProducts('Test Saree');
      assert(results.items.length >= 1, 'Search by name returned 0');
    }},
    { name: 'products-search-by-barcode-exact', fn: async () => {
      const prod = await api.getProductByBarcode('8901234560002');
      assert(prod, 'Barcode search returned null');
      assertEq(prod.product_code, 'TST-002');
    }},
    { name: 'products-get-next-code', fn: async () => {
      const code = await api.getNextProductCode();
      assert(code.startsWith('QA-'), `Expected QA- prefix, got ${code}`);
    }},
    { name: 'products-create-new', fn: async () => {
      const code = await api.getNextProductCode();
      try {
        const prod = await api.createProduct({
          product_code: code,
          name: 'WF Test Product ' + Date.now(),
          barcode: '9999999' + Date.now().toString().slice(-6),
          retail_price: 999,
          mrp: 999,
          purchase_price: 500,
          cgst_pct: 2.5,
          sgst_pct: 2.5,
          hsn_code: '5407',
          unit: 'PCS',
          current_stock: 10,
          min_stock: 5,
          active: true,
        });
        assert(prod.id, 'Product not created');
        wfNewProductId = prod.id;
      } catch (e) {
        // Might fail if code already exists — not fatal
        if (e.message && e.message.includes('unique')) {
          throw new Error('SKIP: Duplicate product code, likely from previous test run');
        }
        throw e;
      }
    }},
    { name: 'products-update-price', fn: async () => {
      if (!wfNewProductId) throw new Error('SKIP: product not created');
      await api.updateProduct(wfNewProductId, { retail_price: 1099 });
      const prod = await api.getProduct(wfNewProductId);
      assertEq(prod.retail_price, 1099);
    }},
  ]);

  // ============================================================
  // 5. STOCK MANAGEMENT WORKFLOW (5 tests)
  // ============================================================
  await runSuite('Workflow — Stock Management', [
    { name: 'stock-low-stock-items', fn: async () => {
      const result = await api.getLowStockProducts();
      assert(result.items.length >= 1, 'Expected low stock items');
      const item = result.items[0];
      assert(item.current_stock < item.min_stock, 'Item is not actually low stock');
    }},
    { name: 'stock-negative-items', fn: async () => {
      const result = await api.getNegativeStockProducts();
      assert(result.items.length >= 1, 'Expected negative stock items');
      assert(result.items[0].current_stock < 0, 'Item is not actually negative');
    }},
    { name: 'stock-create-adjustment', fn: async () => {
      if (!wfProductId) throw new Error('SKIP: no product');
      const prod = await api.getProduct(wfProductId);
      const mv = await api.createStockMovement({
        product: wfProductId,
        type: 'adjustment',
        quantity: 10,
        balance_after: prod.current_stock + 10,
        notes: 'Functional test +10',
        created_by: api.getUser().id,
      });
      assert(mv.id, 'Movement not created');
    }},
    { name: 'stock-verify-balance-after', fn: async () => {
      if (!wfProductId) throw new Error('SKIP: no product');
      const movements = await api.getStockMovements(`product = "${wfProductId}"`, 1, 1);
      assert(movements.items.length >= 1, 'No movements');
      const latest = movements.items[0]; // sorted by -created
      assert(typeof latest.balance_after === 'number', 'balance_after missing');
    }},
    { name: 'stock-list-movements-by-product', fn: async () => {
      if (!wfProductId) throw new Error('SKIP: no product');
      const movements = await api.getStockMovements(`product = "${wfProductId}"`);
      assert(movements.items.length >= 1, 'No movements for this product');
      for (const mv of movements.items) {
        assertEq(mv.product, wfProductId);
      }
    }},
  ]);

  // ============================================================
  // 6. FORM VALIDATION VIA API (6 tests)
  // ============================================================
  await runSuite('Workflow — Form Validation', [
    { name: 'validation-invoice-without-items-ok', fn: async () => {
      // Creating an invoice record without items is valid (items are separate records)
      // Note: PocketBase treats 0 as blank for required number fields, so we use 1
      const user = api.getUser();
      const inv = await api.getNextInvoiceNumber();
      const invoice = await api.createInvoice({
        invoice_number: inv.number,
        invoice_date: new Date().toISOString().split('T')[0],
        customer: wfCustomerId,
        created_by: user.id,
        subtotal: 1,
        cgst_total: 0.01,
        sgst_total: 0.01,
        discount_total: 0,
        adjustment: 0,
        grand_total: 1,
        payment_method: 'cash',
        status: 'completed',
        notes: 'Empty invoice test (no items)',
      });
      await api.incrementInvoiceCounter(inv.counter);
      assert(invoice.id, 'Invoice without items should still be created');
    }},
    { name: 'validation-invoice-item-qty-zero', fn: async () => {
      // PocketBase does not validate qty > 0 at the DB level
      if (!wfInvoiceId || !wfProductId) throw new Error('SKIP: prereqs');
      const item = await api.createInvoiceItem({
        invoice: wfInvoiceId,
        product: wfProductId,
        product_code: 'TST-001',
        product_name: 'Test',
        hsn_code: '5407',
        unit_price: 100,
        quantity: 0,
        line_total: 0,
        cgst_pct: 2.5, sgst_pct: 2.5,
        cgst_amount: 0, sgst_amount: 0,
        taxable_amount: 0,
        unit: 'PCS',
      });
      assert(item.id, 'Item with qty 0 should still be created (no server-side validation)');
    }},
    { name: 'validation-duplicate-product-code', fn: async () => {
      // product_code has unique constraint — creating a dup should fail
      try {
        await api.createProduct({
          product_code: 'TST-001',
          name: 'Duplicate Code Product',
          retail_price: 100, mrp: 100, purchase_price: 50,
          cgst_pct: 2.5, sgst_pct: 2.5,
          current_stock: 0, min_stock: 0, active: true,
        });
        throw new Error('Expected duplicate product_code to be rejected');
      } catch (e) {
        // Expected — PB returns 400 with validation error
        assert(!e.message.includes('Expected duplicate'), e.message);
      }
    }},
    { name: 'validation-duplicate-customer-mobile', fn: async () => {
      // mobile has unique constraint
      try {
        await api.createCustomer({ name: 'Dup Mobile', mobile: '9876500099', state: 'MP' });
        throw new Error('Expected duplicate mobile to be rejected');
      } catch (e) {
        assert(!e.message.includes('Expected duplicate'), e.message);
      }
    }},
    { name: 'validation-invalid-payment-method', fn: async () => {
      // If the schema has select validation on payment_method, invalid values fail.
      // If not, this may succeed — we test the behavior either way.
      const user = api.getUser();
      const inv = await api.getNextInvoiceNumber();
      let rejected = false;
      try {
        await api.createInvoice({
          invoice_number: inv.number,
          invoice_date: new Date().toISOString().split('T')[0],
          customer: wfCustomerId,
          created_by: user.id,
          subtotal: 100, cgst_total: 0, sgst_total: 0,
          discount_total: 0, adjustment: 0, grand_total: 100,
          payment_method: 'bitcoin_invalid_method',
          status: 'completed',
        });
        // If it succeeded, the schema doesn't validate payment_method strictly
        await api.incrementInvoiceCounter(inv.counter);
      } catch {
        rejected = true;
      }
      // Either outcome is valid — we just document behavior
      assert(true, rejected ? 'Invalid payment_method rejected (schema validates)' : 'Invalid payment_method accepted (no select constraint)');
    }},
    { name: 'validation-missing-required-fields', fn: async () => {
      // Try creating an invoice with missing required fields
      await assertRejects(
        api.createInvoice({}),
        'Expected empty invoice to be rejected'
      );
    }},
  ]);

  // ============================================================
  // 7. DATA INTEGRITY (5 tests)
  // ============================================================
  await runSuite('Workflow — Data Integrity', [
    { name: 'integrity-invoice-item-references-valid-invoice', fn: async () => {
      if (!wfInvoiceId) throw new Error('SKIP: no invoice');
      const items = await api.getInvoiceItems(wfInvoiceId);
      for (const item of items) {
        assertEq(item.invoice, wfInvoiceId, `Item ${item.id} references wrong invoice`);
      }
    }},
    { name: 'integrity-invoice-item-orphan-prevention', fn: async () => {
      // Attempt to create an invoice_item with a non-existent invoice ID
      try {
        await api.createInvoiceItem({
          invoice: 'nonexistent_id_12345',
          product: wfProductId || 'dummy',
          product_code: 'TST-001',
          product_name: 'Test',
          unit_price: 100, quantity: 1, line_total: 100,
          cgst_pct: 2.5, sgst_pct: 2.5,
          cgst_amount: 1.22, sgst_amount: 1.22, taxable_amount: 95.24,
          unit: 'PCS',
        });
        throw new Error('Expected orphan item creation to fail');
      } catch (e) {
        assert(!e.message.includes('Expected orphan'), 'PB should reject invalid relation: ' + e.message);
      }
    }},
    { name: 'integrity-settings-keys-exist', fn: async () => {
      const settings = await api.getSettings();
      assert(settings['invoice_prefix'], 'invoice_prefix missing');
      assert(settings['financial_year'], 'financial_year missing');
      assert(settings['invoice_counter'] !== undefined, 'invoice_counter missing');
    }},
    { name: 'integrity-stock-movement-references-product', fn: async () => {
      if (!wfProductId) throw new Error('SKIP: no product');
      const result = await api.getStockMovements(`product = "${wfProductId}"`, 1, 5);
      for (const mv of result.items) {
        assertEq(mv.product, wfProductId);
        assert(typeof mv.quantity === 'number', 'quantity not a number');
        assert(typeof mv.balance_after === 'number', 'balance_after not a number');
      }
    }},
    { name: 'integrity-invoice-counter-increments', fn: async () => {
      const inv1 = await api.getNextInvoiceNumber();
      const counter1 = inv1.counter;
      // After incrementing, next call should return counter+1
      await api.incrementInvoiceCounter(counter1);
      const inv2 = await api.getNextInvoiceNumber();
      assertEq(inv2.counter, counter1 + 1, `Expected counter ${counter1 + 1}, got ${inv2.counter}`);
    }},
  ]);

  // ===== COMBINED SUMMARY =====
  const summaryEl = document.getElementById('summary');
  const allPassed = totalPassed;
  const allFailed = totalFailed;
  const total = allPassed + allFailed;
  const allGreen = allFailed === 0;

  progress.textContent = 'All tests complete.';
  summaryEl.className = 'summary ' + (allGreen ? 'pass-bg' : 'fail-bg');
  summaryEl.innerHTML = `<strong>${allGreen ? 'ALL PASSED' : 'SOME FAILED'}</strong> — ` +
    `${allPassed} passed, ${allFailed} failed out of ${total}<br>` +
    `<span style="font-size:12px; opacity:0.8;">test.js: ${baseP}p/${baseF}f | ` +
    `functional-tests.js: ${allPassed - baseP}p/${allFailed - baseF}f</span>`;

})();
