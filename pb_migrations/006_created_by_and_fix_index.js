/// <reference path="../pb_data/types.d.ts" />

// Migration: Add created_by field to invoices, drop unique index on invoice_number
migrate((app) => {
  const invoices = app.findCollectionByNameOrId("invoices");

  // Add created_by relation to users
  invoices.fields.add(new RelationField({
    name: "created_by",
    collectionId: "_pb_users_auth_",
    maxSelect: 1,
  }));

  // Drop UNIQUE index on invoice_number and replace with regular index
  // (needed for edit/revise: same invoice_number, multiple rows)
  invoices.indexes = invoices.indexes.map(idx => {
    if (typeof idx === "string" && idx.includes("idx_invoice_number")) {
      return "CREATE INDEX idx_invoice_number ON invoices (invoice_number)";
    }
    return idx;
  });

  app.save(invoices);
}, (app) => {
  const invoices = app.findCollectionByNameOrId("invoices");
  invoices.fields.removeByName("created_by");

  invoices.indexes = invoices.indexes.map(idx => {
    if (typeof idx === "string" && idx.includes("idx_invoice_number")) {
      return "CREATE UNIQUE INDEX idx_invoice_number ON invoices (invoice_number)";
    }
    return idx;
  });

  app.save(invoices);
});
