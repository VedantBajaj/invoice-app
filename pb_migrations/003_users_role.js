/// <reference path="../pb_data/types.d.ts" />

// Migration: Add 'role' field to users collection and set API rules
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");

  // Add role select field
  users.fields.add(new SelectField({
    name: "role",
    required: true,
    values: ["admin", "manager", "salesperson", "viewer"],
  }));

  // Add active bool field
  users.fields.add(new BoolField({
    name: "active",
    required: false,
  }));

  // Set API rules — any authenticated user can list/view users
  users.listRule = '@request.auth.id != ""';
  users.viewRule = '@request.auth.id != ""';
  users.createRule = '@request.auth.role = "admin"';
  users.updateRule = '@request.auth.role = "admin" || id = @request.auth.id';
  users.deleteRule = '@request.auth.role = "admin"';

  app.save(users);
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.removeByName("role");
  users.fields.removeByName("active");
  app.save(users);
});
