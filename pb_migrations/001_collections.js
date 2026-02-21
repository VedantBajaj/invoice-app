/// <reference path="../pb_data/types.d.ts" />

// Migration: Create all application collections
migrate((app) => {
  // ===== 1. PRODUCTS =====
  const products = new Collection({
    name: "products",
    type: "base",
    fields: [
      { name: "product_code", type: "text", required: true },
      { name: "name", type: "text", required: true },
      { name: "description", type: "text" },
      { name: "hsn_code", type: "text" },
      { name: "sub_category", type: "number" },
      { name: "purchase_price", type: "number" },
      { name: "retail_price", type: "number", required: true },
      { name: "mrp", type: "number", required: true },
      { name: "wholesale_price", type: "number" },
      { name: "discount_pct", type: "number" },
      { name: "cgst_pct", type: "number" },
      { name: "sgst_pct", type: "number" },
      { name: "cess_pct", type: "number" },
      { name: "unit", type: "text" },
      { name: "barcode", type: "text" },
      { name: "batch", type: "text" },
      { name: "size", type: "text" },
      { name: "colour", type: "text" },
      { name: "imei_1", type: "text" },
      { name: "imei_2", type: "text" },
      { name: "min_stock", type: "number" },
      { name: "current_stock", type: "number" },
      { name: "active", type: "bool" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_product_code ON products (product_code)",
      "CREATE INDEX idx_product_barcode ON products (barcode)",
      "CREATE INDEX idx_product_name ON products (name)",
    ],
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.role = "admin" || @request.auth.role = "manager" || @request.auth.role = "salesperson"',
    updateRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    deleteRule: '@request.auth.role = "admin"',
  });
  app.save(products);

  // ===== 2. SUPPLIERS =====
  const suppliers = new Collection({
    name: "suppliers",
    type: "base",
    fields: [
      { name: "supplier_code", type: "text", required: true },
      { name: "name", type: "text", required: true },
      { name: "address", type: "text" },
      { name: "city", type: "text" },
      { name: "state", type: "text" },
      { name: "postal_code", type: "text" },
      { name: "phone", type: "text" },
      { name: "email", type: "email" },
      { name: "gstin", type: "text" },
      { name: "pan", type: "text" },
      { name: "bank_name", type: "text" },
      { name: "bank_account", type: "text" },
      { name: "bank_branch", type: "text" },
      { name: "bank_ifsc", type: "text" },
      { name: "opening_balance", type: "number" },
      { name: "opening_balance_type", type: "text" },
      { name: "active", type: "bool" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_supplier_code ON suppliers (supplier_code)",
    ],
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    updateRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    deleteRule: '@request.auth.role = "admin"',
  });
  app.save(suppliers);

  // ===== 3. CUSTOMERS =====
  const customers = new Collection({
    name: "customers",
    type: "base",
    fields: [
      { name: "name", type: "text", required: true },
      { name: "mobile", type: "text", required: true },
      { name: "email", type: "email" },
      { name: "address", type: "text" },
      { name: "city", type: "text" },
      { name: "state", type: "text" },
      { name: "gstin", type: "text" },
      { name: "notes", type: "text" },
      { name: "total_purchases", type: "number" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_customer_mobile ON customers (mobile)",
      "CREATE INDEX idx_customer_name ON customers (name)",
    ],
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.role != "viewer"',
    deleteRule: '@request.auth.role = "admin"',
  });
  app.save(customers);

  // ===== 4. INVOICES =====
  const invoices = new Collection({
    name: "invoices",
    type: "base",
    fields: [
      { name: "invoice_number", type: "text", required: true },
      { name: "invoice_date", type: "date", required: true },
      { name: "customer", type: "relation", required: true, collectionId: customers.id, maxSelect: 1 },
      { name: "tax_type", type: "text" },
      { name: "subtotal", type: "number", required: true },
      { name: "discount_total", type: "number" },
      { name: "cgst_total", type: "number" },
      { name: "sgst_total", type: "number" },
      { name: "igst_total", type: "number" },
      { name: "cess_total", type: "number" },
      { name: "grand_total", type: "number", required: true },
      { name: "amount_paid", type: "number" },
      { name: "payment_method", type: "select", values: ["cash", "upi", "card", "credit"] },
      { name: "payment_reference", type: "text" },
      { name: "status", type: "select", required: true, values: ["draft", "completed", "cancelled"] },
      { name: "notes", type: "text" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_invoice_number ON invoices (invoice_number)",
      "CREATE INDEX idx_invoice_date ON invoices (invoice_date)",
      "CREATE INDEX idx_invoice_customer ON invoices (customer)",
    ],
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.role != "viewer"',
    updateRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    deleteRule: '@request.auth.role = "admin"',
  });
  app.save(invoices);

  // ===== 5. INVOICE ITEMS =====
  const invoiceItems = new Collection({
    name: "invoice_items",
    type: "base",
    fields: [
      { name: "invoice", type: "relation", required: true, collectionId: invoices.id, maxSelect: 1, cascadeDelete: true },
      { name: "product", type: "relation", required: true, collectionId: products.id, maxSelect: 1 },
      { name: "product_name", type: "text", required: true },
      { name: "product_code", type: "text" },
      { name: "hsn_code", type: "text" },
      { name: "barcode", type: "text" },
      { name: "quantity", type: "number", required: true },
      { name: "unit", type: "text" },
      { name: "unit_price", type: "number", required: true },
      { name: "mrp", type: "number" },
      { name: "discount_pct", type: "number" },
      { name: "discount_amount", type: "number" },
      { name: "taxable_amount", type: "number", required: true },
      { name: "cgst_pct", type: "number" },
      { name: "cgst_amount", type: "number" },
      { name: "sgst_pct", type: "number" },
      { name: "sgst_amount", type: "number" },
      { name: "total", type: "number", required: true },
      { name: "batch", type: "text" },
      { name: "imei_1", type: "text" },
      { name: "imei_2", type: "text" },
    ],
    indexes: [
      "CREATE INDEX idx_ii_invoice ON invoice_items (invoice)",
      "CREATE INDEX idx_ii_product ON invoice_items (product)",
    ],
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.role != "viewer"',
    updateRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    deleteRule: '@request.auth.role = "admin"',
  });
  app.save(invoiceItems);

  // ===== 6. STOCK MOVEMENTS =====
  const stockMovements = new Collection({
    name: "stock_movements",
    type: "base",
    fields: [
      { name: "product", type: "relation", required: true, collectionId: products.id, maxSelect: 1 },
      { name: "type", type: "select", required: true, values: ["sale", "purchase", "adjustment", "opening", "return"] },
      { name: "quantity", type: "number", required: true },
      { name: "reference_type", type: "text" },
      { name: "reference_id", type: "text" },
      { name: "balance_after", type: "number" },
      { name: "notes", type: "text" },
    ],
    indexes: [
      "CREATE INDEX idx_sm_product ON stock_movements (product)",
      "CREATE INDEX idx_sm_type ON stock_movements (type)",
    ],
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.role != "viewer"',
    updateRule: '@request.auth.role = "admin"',
    deleteRule: '@request.auth.role = "admin"',
  });
  app.save(stockMovements);

  // ===== 7. SETTINGS =====
  const settings = new Collection({
    name: "settings",
    type: "base",
    fields: [
      { name: "key", type: "text", required: true },
      { name: "value", type: "text", required: true },
      { name: "category", type: "text" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_settings_key ON settings (key)",
    ],
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.role = "admin"',
    updateRule: '@request.auth.role = "admin"',
    deleteRule: '@request.auth.role = "admin"',
  });
  app.save(settings);
}, (app) => {
  // Revert: delete collections in reverse dependency order
  const names = ["settings", "stock_movements", "invoice_items", "invoices", "customers", "suppliers", "products"];
  for (const name of names) {
    try { app.delete(app.findCollectionByNameOrId(name)); } catch(e) {}
  }
});
