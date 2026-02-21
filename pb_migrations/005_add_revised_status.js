/// <reference path="../pb_data/types.d.ts" />

// Migration: Add "revised" to invoices status field
migrate((app) => {
  const invoices = app.findCollectionByNameOrId("invoices");
  const statusField = invoices.fields.getByName("status");
  statusField.values = ["draft", "completed", "cancelled", "revised"];
  app.save(invoices);
}, (app) => {
  const invoices = app.findCollectionByNameOrId("invoices");
  const statusField = invoices.fields.getByName("status");
  statusField.values = ["draft", "completed", "cancelled"];
  app.save(invoices);
});
