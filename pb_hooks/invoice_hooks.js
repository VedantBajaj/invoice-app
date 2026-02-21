/// <reference path="../pb_data/types.d.ts" />

// Hook: Auto-generate invoice number on invoice creation
// Skips if invoice_number is already set (e.g., historical import)
onRecordCreateRequest((e) => {
  const existingNumber = e.record.get("invoice_number");
  if (existingNumber && existingNumber.length > 0) {
    // Already has a number (import/manual) — skip auto-generation
    e.next();
    return;
  }

  const settingsCol = e.app.findCollectionByNameOrId("settings");
  const prefixRec = e.app.findFirstRecordByFilter(settingsCol, 'key = "invoice_prefix"');
  const yearRec = e.app.findFirstRecordByFilter(settingsCol, 'key = "financial_year"');
  const counterRec = e.app.findFirstRecordByFilter(settingsCol, 'key = "invoice_counter"');

  const prefix = prefixRec ? prefixRec.get("value") : "GST";
  const year = yearRec ? yearRec.get("value") : "2025/26";
  let counter = counterRec ? parseInt(counterRec.get("value")) : 0;

  counter++;
  const invoiceNumber = `${prefix}-${String(counter).padStart(4, "0")}-${year}`;

  if (counterRec) {
    counterRec.set("value", String(counter));
    e.app.save(counterRec);
  }

  e.record.set("invoice_number", invoiceNumber);
  e.next();
}, "invoices");

// Hook: Update product stock when invoice item is created
// Checks the parent invoice status — only decrements for non-import invoices
// Import script sets status="completed" and handles stock separately
onRecordAfterCreateSuccess((e) => {
  const productId = e.record.get("product");
  const quantity = e.record.get("quantity") || 0;
  if (!productId || quantity <= 0) return;

  // Check if this is a historical import by looking at the invoice notes
  const invoiceId = e.record.get("invoice");
  if (!invoiceId) return;

  try {
    const invoicesCol = e.app.findCollectionByNameOrId("invoices");
    const invoice = e.app.findRecordById(invoicesCol, invoiceId);
    // Skip stock update for completed imports (already accounted for in opening stock)
    if (invoice && invoice.get("notes") === "__import__") return;
  } catch (err) {
    // If we can't find the invoice, proceed with stock update
  }

  // Decrement product stock
  const productsCol = e.app.findCollectionByNameOrId("products");
  const product = e.app.findRecordById(productsCol, productId);

  if (product) {
    const currentStock = product.get("current_stock") || 0;
    const newStock = currentStock - quantity;
    product.set("current_stock", newStock);
    e.app.save(product);

    // Create stock movement record
    const movementsCol = e.app.findCollectionByNameOrId("stock_movements");
    const movement = new Record(movementsCol);
    movement.set("product", productId);
    movement.set("type", "sale");
    movement.set("quantity", -quantity);
    movement.set("reference_type", "invoice");
    movement.set("reference_id", invoiceId);
    movement.set("balance_after", newStock);
    e.app.save(movement);
  }
}, "invoice_items");
