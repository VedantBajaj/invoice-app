/// <reference path="../pb_data/types.d.ts" />

// Migration: Add adjustment field to invoices collection
migrate((app) => {
  const invoices = app.findCollectionByNameOrId("invoices");
  invoices.fields.add(new Field({ name: "adjustment", type: "number" }));
  app.save(invoices);
}, (app) => {
  const invoices = app.findCollectionByNameOrId("invoices");
  invoices.fields.removeByName("adjustment");
  app.save(invoices);
});
