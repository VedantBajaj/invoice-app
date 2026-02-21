/// <reference path="../pb_data/types.d.ts" />

// Migration: Seed default settings
migrate((app) => {
  const collection = app.findCollectionByNameOrId("settings");

  const defaults = [
    { key: "shop_name", value: "-", category: "shop" },
    { key: "shop_address", value: "Harda, Madhya Pradesh", category: "shop" },
    { key: "shop_phone", value: "-", category: "shop" },
    { key: "shop_gstin", value: "-", category: "shop" },
    { key: "invoice_prefix", value: "GST", category: "invoice" },
    { key: "invoice_counter", value: "0", category: "invoice" },
    { key: "financial_year", value: "2025/26", category: "invoice" },
    { key: "default_cgst", value: "2.5", category: "tax" },
    { key: "default_sgst", value: "2.5", category: "tax" },
    { key: "default_state", value: "Madhya Pradesh", category: "tax" },
    { key: "upi_id", value: "-", category: "payment" },
    { key: "bank_details", value: "-", category: "payment" },
  ];

  for (const item of defaults) {
    const record = new Record(collection);
    record.set("key", item.key);
    record.set("value", item.value);
    record.set("category", item.category);
    app.save(record);
  }
}, (app) => {
  const collection = app.findCollectionByNameOrId("settings");
  const records = app.findRecordsByFilter(collection, "1=1");
  for (const r of records) {
    app.delete(r);
  }
});
