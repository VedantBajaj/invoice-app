/**
 * Data Import Script — imports suppliers, products, and historical invoices
 * from Excel files into PocketBase.
 *
 * Usage: node import-data.mjs [--base-url http://localhost:8090]
 *
 * Requires PocketBase to be running. Authenticates as superuser.
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const BASE_URL = process.argv.includes("--base-url")
  ? process.argv[process.argv.indexOf("--base-url") + 1]
  : "http://localhost:8090";

const SUPERUSER_EMAIL = process.env.PB_ADMIN_EMAIL || "admin@example.com";
const SUPERUSER_PASSWORD = process.env.PB_ADMIN_PASSWORD || "";

if (!SUPERUSER_PASSWORD) {
  console.error("Set PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD environment variables");
  process.exit(1);
}

const DATA_DIR = process.env.IMPORT_DATA_DIR || "./data";
const FILES = {
  products: `${DATA_DIR}/Product Entry.xlsx`,
  suppliers: `${DATA_DIR}/Supplir.xlsx`,
  sales: `${DATA_DIR}/Sales Report.xlsx`,
};

// ===== HELPERS =====

let authToken = "";

async function api(method, path, body) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (authToken) opts.headers["Authorization"] = `Bearer ${authToken}`;
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${path}`, opts);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`API ${method} ${path} failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

async function authenticate() {
  const data = await api("POST", "/api/collections/_superusers/auth-with-password", {
    identity: SUPERUSER_EMAIL,
    password: SUPERUSER_PASSWORD,
  });
  authToken = data.token;
  console.log("  Authenticated as superuser");
}

function normalizeUnit(raw) {
  const u = (raw || "").trim().toUpperCase();
  if (["PCS", "PC", "P", "NOS", ""].includes(u) || u.startsWith("PCS")) return "PCS";
  if (u === "BOX") return "BOX";
  if (u === "KG") return "KG";
  if (["M", "METERS"].includes(u)) return "M";
  if (u === "L") return "L";
  if (u === "POUCH") return "POUCH";
  return "PCS";
}

function clean(val) {
  if (val === null || val === undefined || val === "None" || val === "none") return "";
  return String(val).trim();
}

function num(val) {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

function parseInvoiceDate(dateVal) {
  // Handle Excel date serial numbers or date objects
  if (dateVal instanceof Date) {
    return dateVal.toISOString().split("T")[0] + " 00:00:00.000Z";
  }
  // Handle string format: "26-Aug-25 12:00:00 AM"
  const str = String(dateVal).trim();
  const months = { Jan:1, Feb:2, Mar:3, Apr:4, May:5, Jun:6, Jul:7, Aug:8, Sep:9, Oct:10, Nov:11, Dec:12 };
  const parts = str.split(" ")[0].split("-");
  if (parts.length === 3 && months[parts[1]]) {
    const year = 2000 + parseInt(parts[2]);
    const month = String(months[parts[1]]).padStart(2, "0");
    const day = parts[0].padStart(2, "0");
    return `${year}-${month}-${day} 00:00:00.000Z`;
  }
  // Fallback
  return new Date(dateVal).toISOString();
}

// ===== READ EXCEL =====

function readExcel(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { headers, rows };
}

// ===== IMPORT SUPPLIERS =====

async function importSuppliers() {
  console.log("\n=== Importing Suppliers ===");
  const { rows } = await readExcel(FILES.suppliers);
  console.log(`  Found ${rows.length} suppliers`);

  let created = 0;
  for (const row of rows) {
    const supplierCode = clean(row["Supplier ID"]) || clean(row["Supplier Code"]);
    if (!supplierCode) continue;

    try {
      await api("POST", "/api/collections/suppliers/records", {
        supplier_code: supplierCode,
        name: clean(row["Supplier Name"]) || "-",
        address: clean(row["Address"]),
        city: clean(row["City"]),
        state: clean(row["State"]),
        postal_code: clean(row["Postal Code"]),
        phone: clean(row["Contact No."]),
        email: clean(row["Email ID"]) || "",
        gstin: clean(row["GSTIN/UID"]),
        pan: clean(row["PAN"]),
        bank_name: clean(row["Bank"]),
        bank_account: clean(row["Account No."]),
        bank_branch: clean(row["Branch"]),
        bank_ifsc: clean(row["IFSC Code"]),
        opening_balance: num(row["Opening Balance"]),
        opening_balance_type: clean(row["Opening Balance Type"]),
        active: true,
      });
      created++;
    } catch (e) {
      console.error(`  ERROR supplier ${supplierCode}: ${e.message}`);
    }
  }
  console.log(`  Created ${created}/${rows.length} suppliers`);
}

// ===== IMPORT PRODUCTS =====

async function importProducts() {
  console.log("\n=== Importing Products ===");
  const { rows } = await readExcel(FILES.products);
  console.log(`  Found ${rows.length} products`);

  let created = 0;
  for (const row of rows) {
    const code = clean(row["Product Code"]);
    if (!code) continue;

    try {
      await api("POST", "/api/collections/products/records", {
        product_code: code,
        name: clean(row["Product Name"]) || code,
        description: clean(row["Description"]),
        hsn_code: clean(row["HSN Code"]),
        sub_category: num(row["Sub Category ID"]),
        purchase_price: num(row["Purchase Price"]),
        retail_price: num(row["Retail Sale Price"]) || num(row["MRP"]),
        mrp: num(row["MRP"]) || num(row["Retail Sale Price"]),
        wholesale_price: num(row["Wholesale Price"]),
        discount_pct: num(row["Discount %"]),
        cgst_pct: num(row["CGST %"]) || 2.5,
        sgst_pct: num(row["SGST %"]) || 2.5,
        cess_pct: num(row["CESS %"]),
        unit: normalizeUnit(row["Sales Unit"]),
        barcode: clean(row["Barcode"]),
        batch: clean(row["Batch"]),
        size: clean(row["Size"]),
        colour: clean(row["Colour"]),
        imei_1: clean(row["IMEI-1"]),
        imei_2: clean(row["IMEI-2"]),
        min_stock: num(row["Minimum Stock"]),
        current_stock: num(row["Opening Qty"]),
        active: true,
      });
      created++;
    } catch (e) {
      console.error(`  ERROR product ${code}: ${e.message}`);
    }

    // Progress
    if (created % 100 === 0 && created > 0) {
      process.stdout.write(`  ...${created} `);
    }
  }
  console.log(`\n  Created ${created}/${rows.length} products`);
  return created;
}

// ===== CREATE OPENING STOCK MOVEMENTS =====

async function createOpeningStockMovements() {
  console.log("\n=== Creating Opening Stock Movements ===");

  // Fetch all products with stock > 0
  let page = 1;
  let created = 0;
  while (true) {
    const data = await api("GET", `/api/collections/products/records?filter=(current_stock>0)&perPage=200&page=${page}`);
    for (const product of data.items) {
      try {
        await api("POST", "/api/collections/stock_movements/records", {
          product: product.id,
          type: "opening",
          quantity: product.current_stock,
          reference_type: "import",
          reference_id: "initial_import",
          balance_after: product.current_stock,
          notes: "Opening stock from Excel import",
        });
        created++;
      } catch (e) {
        console.error(`  ERROR stock movement ${product.product_code}: ${e.message}`);
      }
    }
    if (page >= data.totalPages) break;
    page++;
  }
  console.log(`  Created ${created} opening stock movements`);
}

// ===== IMPORT INVOICES =====

async function importInvoices() {
  console.log("\n=== Importing Historical Invoices ===");
  const { rows } = await readExcel(FILES.sales);
  console.log(`  Found ${rows.length} line items`);

  // Create "Cash (Walk-in)" customer
  let cashCustomer;
  try {
    cashCustomer = await api("POST", "/api/collections/customers/records", {
      name: "Cash (Walk-in)",
      mobile: "0000000000",
      state: "Madhya Pradesh",
      total_purchases: 0,
    });
    console.log(`  Created Cash customer: ${cashCustomer.id}`);
  } catch (e) {
    // May already exist — fetch it
    const existing = await api("GET", '/api/collections/customers/records?filter=(mobile="0000000000")');
    cashCustomer = existing.items[0];
    console.log(`  Using existing Cash customer: ${cashCustomer.id}`);
  }

  // Build product lookup by product_code
  console.log("  Building product lookup...");
  const productMap = new Map();
  let page = 1;
  while (true) {
    const data = await api("GET", `/api/collections/products/records?perPage=200&page=${page}`);
    for (const p of data.items) {
      productMap.set(p.product_code, p);
    }
    if (page >= data.totalPages) break;
    page++;
  }
  console.log(`  Loaded ${productMap.size} products`);

  // Group rows by invoice number
  const invoiceGroups = new Map();
  for (const row of rows) {
    const invNo = clean(row["Invoice No."]);
    if (!invNo) continue;
    if (!invoiceGroups.has(invNo)) invoiceGroups.set(invNo, []);
    invoiceGroups.get(invNo).push(row);
  }
  console.log(`  Found ${invoiceGroups.size} unique invoices`);

  // Import each invoice
  let invoicesCreated = 0;
  let itemsCreated = 0;
  let maxCounter = 0;

  for (const [invNo, items] of invoiceGroups) {
    // Parse invoice number to get counter: GST-0001-2025/26 -> 1
    const match = invNo.match(/GST-(\d+)/);
    if (match) {
      maxCounter = Math.max(maxCounter, parseInt(match[1]));
    }

    // Calculate totals from line items
    let subtotal = 0, cgstTotal = 0, sgstTotal = 0, grandTotal = 0;
    for (const item of items) {
      const qty = num(item["Qty."]);
      const rate = num(item["Sales Rate"]);
      const lineAmount = qty * rate;
      subtotal += lineAmount;
      cgstTotal += num(item["CGST"]);
      sgstTotal += num(item["SGST/UTGST"]);
      grandTotal += num(item["Total Amount"]);
    }

    // Create invoice
    let invoice;
    try {
      invoice = await api("POST", "/api/collections/invoices/records", {
        invoice_number: invNo,
        invoice_date: parseInvoiceDate(items[0]["Invoice Date"]),
        customer: cashCustomer.id,
        tax_type: "GST",
        subtotal: Math.round(subtotal * 100) / 100,
        discount_total: 0,
        cgst_total: Math.round(cgstTotal * 100) / 100,
        sgst_total: Math.round(sgstTotal * 100) / 100,
        igst_total: 0,
        cess_total: 0,
        grand_total: Math.round(grandTotal * 100) / 100,
        amount_paid: Math.round(grandTotal * 100) / 100,
        payment_method: "cash",
        status: "completed",
        notes: "__import__",
      });
      invoicesCreated++;
    } catch (e) {
      console.error(`  ERROR invoice ${invNo}: ${e.message}`);
      continue;
    }

    // Create line items (skip stock hooks for historical data — we handle stock separately)
    for (const item of items) {
      const productCode = clean(item["Product Code"]);
      const product = productMap.get(productCode);
      if (!product) {
        console.error(`  WARNING: Product ${productCode} not found for invoice ${invNo}`);
        continue;
      }

      const qty = num(item["Qty."]);
      const rate = num(item["Sales Rate"]);
      const taxableAmount = qty * rate;
      const cgstAmt = num(item["CGST"]);
      const sgstAmt = num(item["SGST/UTGST"]);
      const total = num(item["Total Amount"]);

      try {
        await api("POST", "/api/collections/invoice_items/records", {
          invoice: invoice.id,
          product: product.id,
          product_name: clean(item["Product Name"]) || product.name,
          product_code: productCode,
          hsn_code: clean(item["HSN Code"]) || product.hsn_code,
          barcode: clean(item["Barcode"]) || product.barcode,
          quantity: qty,
          unit: "PCS",
          unit_price: rate,
          mrp: product.mrp,
          discount_pct: num(item["Discount %"]),
          discount_amount: num(item["Discount"]),
          taxable_amount: Math.round(taxableAmount * 100) / 100,
          cgst_pct: num(item["CGST %"]) || 2.5,
          cgst_amount: cgstAmt,
          sgst_pct: num(item["SGST %"]) || 2.5,
          sgst_amount: sgstAmt,
          total: total,
          batch: clean(item["Batch/Serial"]),
        });
        itemsCreated++;
      } catch (e) {
        console.error(`  ERROR item ${productCode} in ${invNo}: ${e.message}`);
      }
    }
  }

  console.log(`  Created ${invoicesCreated} invoices, ${itemsCreated} line items`);
  console.log(`  Max invoice counter: ${maxCounter}`);

  // Update invoice counter in settings
  try {
    const counterRec = await api("GET", '/api/collections/settings/records?filter=(key="invoice_counter")');
    if (counterRec.items.length > 0) {
      await api("PATCH", `/api/collections/settings/records/${counterRec.items[0].id}`, {
        value: String(maxCounter),
      });
      console.log(`  Updated invoice counter to ${maxCounter}`);
    }
  } catch (e) {
    console.error(`  ERROR updating counter: ${e.message}`);
  }

  return { invoicesCreated, itemsCreated };
}

// ===== MAIN =====

async function main() {
  console.log("Invoice System - Data Import");
  console.log(`Base URL: ${BASE_URL}`);
  console.log("========================\n");

  try {
    await authenticate();
    await importSuppliers();
    await importProducts();
    await createOpeningStockMovements();
    await importInvoices();

    console.log("\n========================");
    console.log("Import complete!");

    // Print summary
    const summary = await Promise.all([
      api("GET", "/api/collections/suppliers/records?perPage=1"),
      api("GET", "/api/collections/products/records?perPage=1"),
      api("GET", "/api/collections/customers/records?perPage=1"),
      api("GET", "/api/collections/invoices/records?perPage=1"),
      api("GET", "/api/collections/invoice_items/records?perPage=1"),
      api("GET", "/api/collections/stock_movements/records?perPage=1"),
    ]);
    const names = ["suppliers", "products", "customers", "invoices", "invoice_items", "stock_movements"];
    names.forEach((name, i) => {
      console.log(`  ${name}: ${summary[i].totalItems} records`);
    });
  } catch (e) {
    console.error(`\nFATAL ERROR: ${e.message}`);
    process.exit(1);
  }
}

main();
