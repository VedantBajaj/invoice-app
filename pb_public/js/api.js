/**
 * PocketBase API wrapper
 * Uses PocketBase JS SDK (loaded via CDN in index.html)
 */
const pb = new PocketBase(window.location.origin);

// Restore auth from localStorage on load
pb.authStore.onChange(() => {
  if (window.Alpine && Alpine.store("auth")) {
    const auth = Alpine.store("auth");
    auth.user = pb.authStore.record;
    auth.token = pb.authStore.token;
    auth.role = pb.authStore.record?.role || "";
    auth.isLoggedIn = pb.authStore.isValid;
  }
});

const api = {
  // ===== AUTH =====
  async login(email, password) {
    const result = await pb.collection("users").authWithPassword(email, password);
    return result;
  },
  logout() {
    pb.authStore.clear();
  },
  isLoggedIn() {
    return pb.authStore.isValid;
  },
  getUser() {
    return pb.authStore.record;
  },
  getRole() {
    return pb.authStore.record?.role || "";
  },

  // ===== PRODUCTS =====
  async searchProducts(query, page = 1, perPage = 50) {
    const filter = query
      ? `name ~ "${query}" || product_code ~ "${query}" || barcode ~ "${query}"`
      : "";
    return pb.collection("products").getList(page, perPage, {
      filter,
      sort: "name",
      requestKey: null,
    });
  },
  async getProductByBarcode(barcode) {
    try {
      return await pb.collection("products").getFirstListItem(`barcode = "${barcode}"`, { requestKey: null });
    } catch { return null; }
  },
  async getProduct(id) {
    return pb.collection("products").getOne(id, { requestKey: null });
  },
  async getNextProductCode() {
    try {
      const result = await pb.collection("products").getList(1, 1, {
        filter: 'product_code ~ "QA-"',
        sort: "-product_code",
        requestKey: null,
      });
      if (result.items.length > 0) {
        const last = result.items[0].product_code;
        const num = parseInt(last.replace("QA-", ""), 10) || 7000;
        return "QA-" + (num + 1);
      }
    } catch {}
    return "QA-7001";
  },
  async createProduct(data) {
    return pb.collection("products").create(data);
  },
  async updateProduct(id, data) {
    return pb.collection("products").update(id, data);
  },

  // ===== CUSTOMERS =====
  async getCustomerByMobile(mobile) {
    try {
      return await pb.collection("customers").getFirstListItem(`mobile = "${mobile}"`, { requestKey: null });
    } catch { return null; }
  },
  async searchCustomers(query, page = 1) {
    const filter = query
      ? `name ~ "${query}" || mobile ~ "${query}"`
      : "";
    return pb.collection("customers").getList(page, 50, { filter, sort: "name", requestKey: null });
  },
  async createCustomer(data) {
    return pb.collection("customers").create(data);
  },
  async updateCustomer(id, data) {
    return pb.collection("customers").update(id, data);
  },

  // ===== INVOICES =====
  async getNextInvoiceNumber() {
    const settings = await this.getSettings();
    const prefix = settings["invoice_prefix"] || "GST";
    const year = settings["financial_year"] || "2025/26";
    const counter = parseInt(settings["invoice_counter"] || "0") + 1;
    return { number: `${prefix}-${String(counter).padStart(4, "0")}-${year}`, counter };
  },
  async createInvoice(data) {
    return pb.collection("invoices").create(data, { requestKey: null });
  },
  async incrementInvoiceCounter(newCounter) {
    const rec = await pb.collection("settings").getFirstListItem('key = "invoice_counter"', { requestKey: null });
    return pb.collection("settings").update(rec.id, { value: String(newCounter) }, { requestKey: null });
  },
  async createInvoiceItem(data) {
    return pb.collection("invoice_items").create(data, { requestKey: null });
  },
  async getInvoices(filter = "", page = 1, perPage = 20) {
    return pb.collection("invoices").getList(page, perPage, {
      filter,
      sort: "-invoice_date",
      expand: "customer,created_by",
      requestKey: null,
    });
  },
  async getInvoice(id) {
    return pb.collection("invoices").getOne(id, { expand: "customer,created_by", requestKey: null });
  },
  async updateInvoice(id, data) {
    return pb.collection("invoices").update(id, data, { requestKey: null });
  },
  async getInvoiceItems(invoiceId) {
    return pb.collection("invoice_items").getFullList({
      filter: `invoice = "${invoiceId}"`,
      expand: "product",
      requestKey: null,
    });
  },

  // ===== STOCK =====
  async createStockMovement(data) {
    return pb.collection("stock_movements").create(data);
  },

  // ===== SETTINGS =====
  async getSettings() {
    const records = await pb.collection("settings").getFullList({ requestKey: null });
    const map = {};
    records.forEach((r) => { map[r.key] = r.value; });
    return map;
  },
  async updateSetting(key, value) {
    const rec = await pb.collection("settings").getFirstListItem(`key = "${key}"`);
    return pb.collection("settings").update(rec.id, { value });
  },

  // ===== DASHBOARD =====
  async getDashboardStats() {
    const today = new Date().toISOString().split("T")[0];
    const [todayInvoices, lowStock, negativeStock] = await Promise.all([
      pb.collection("invoices").getList(1, 1, {
        filter: `invoice_date >= "${today}" && status = "completed"`,
        requestKey: null,
      }),
      pb.collection("products").getList(1, 1, {
        filter: "current_stock < min_stock && current_stock >= 0 && active = true",
        requestKey: null,
      }),
      pb.collection("products").getList(1, 1, {
        filter: "current_stock < 0 && active = true",
        requestKey: null,
      }),
    ]);

    // Get today's total
    const todayAll = await pb.collection("invoices").getFullList({
      filter: `invoice_date >= "${today}" && status = "completed"`,
      requestKey: null,
    });
    const todayTotal = todayAll.reduce((sum, inv) => sum + (inv.grand_total || 0), 0);

    return {
      todayCount: todayInvoices.totalItems,
      todayTotal,
      lowStockCount: lowStock.totalItems,
      negativeStockCount: negativeStock.totalItems,
    };
  },

  // ===== SUPPLIERS =====
  async getSuppliers(page = 1, perPage = 50) {
    return pb.collection("suppliers").getList(page, perPage, { sort: "name", requestKey: null });
  },
  async searchSuppliers(query, page = 1) {
    const filter = query
      ? `name ~ "${query}" || gstin ~ "${query}" || mobile ~ "${query}"`
      : "";
    return pb.collection("suppliers").getList(page, 50, { filter, sort: "name", requestKey: null });
  },
  async updateSupplier(id, data) {
    return pb.collection("suppliers").update(id, data);
  },

  // ===== STOCK =====
  async getStockMovements(filter = "", page = 1, perPage = 50) {
    return pb.collection("stock_movements").getList(page, perPage, {
      filter,
      sort: "-id",
      expand: "product",
      requestKey: null,
    });
  },
  async getLowStockProducts(page = 1) {
    return pb.collection("products").getList(page, 50, {
      filter: "current_stock < min_stock && active = true",
      sort: "current_stock",
      requestKey: null,
    });
  },
  async getNegativeStockProducts(page = 1) {
    return pb.collection("products").getList(page, 50, {
      filter: "current_stock < 0 && active = true",
      sort: "current_stock",
      requestKey: null,
    });
  },

  // ===== REPORTS =====
  async getInvoicesByDateRange(from, to, page = 1, perPage = 200) {
    const filter = `invoice_date >= "${from}" && invoice_date <= "${to}" && status = "completed"`;
    return pb.collection("invoices").getList(page, perPage, {
      filter,
      sort: "-invoice_date",
      expand: "customer",
      requestKey: null,
    });
  },
  async getAllInvoiceItemsForInvoices(invoiceIds) {
    if (!invoiceIds.length) return [];
    const filter = invoiceIds.map(id => `invoice = "${id}"`).join(" || ");
    return pb.collection("invoice_items").getFullList({
      filter,
      expand: "product",
      requestKey: null,
    });
  },

  // ===== USERS =====
  async getUsers() {
    return pb.collection("users").getFullList({ sort: "name", requestKey: null });
  },
  async createUser(data) {
    return pb.collection("users").create(data);
  },
  async updateUser(id, data) {
    return pb.collection("users").update(id, data);
  },
};

window.api = api;
