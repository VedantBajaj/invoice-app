/**
 * Main app — Alpine.js stores, router, global state
 */
document.addEventListener("alpine:init", () => {
  // ===== AUTH STORE =====
  Alpine.store("auth", {
    user: null,
    token: null,
    role: "",
    isLoggedIn: false,
    init() {
      if (api.isLoggedIn()) {
        this.user = api.getUser();
        this.token = pb?.authStore?.token;
        this.role = this.user?.role || "";
        this.isLoggedIn = true;
      }
    },
    canCreate() { return ["admin", "manager", "salesperson"].includes(this.role); },
    canEdit() { return ["admin", "manager"].includes(this.role); },
    isAdmin() { return this.role === "admin"; },
  });

  // ===== CART STORE (persisted to sessionStorage) =====
  const savedCart = JSON.parse(sessionStorage.getItem("cart") || "null");
  Alpine.store("cart", {
    items: savedCart?.items || [],
    customer: savedCart?.customer || null,
    discountAmount: savedCart?.discountAmount || 0,
    // Invoice flow state — survives navigation
    step: savedCart?.step || "products",
    customerMobile: savedCart?.customerMobile || "",
    customerName: savedCart?.customerName || "",
    paymentMethod: savedCart?.paymentMethod || "cash",
    // Edit mode — set when editing an existing invoice
    editingInvoiceId: savedCart?.editingInvoiceId || null,
    editingInvoiceNumber: savedCart?.editingInvoiceNumber || null,

    get isEditing() { return !!this.editingInvoiceId; },

    _save() {
      sessionStorage.setItem("cart", JSON.stringify({
        items: this.items,
        customer: this.customer,
        discountAmount: this.discountAmount,
        step: this.step,
        customerMobile: this.customerMobile,
        customerName: this.customerName,
        paymentMethod: this.paymentMethod,
        editingInvoiceId: this.editingInvoiceId,
        editingInvoiceNumber: this.editingInvoiceNumber,
      }));
    },

    addItem(product) {
      const existing = this.items.find((i) => i.product_id === product.id);
      if (existing) {
        existing.quantity++;
        this.recalcItem(existing);
        this._save();
        return;
      }
      const item = {
        product_id: product.id,
        product_code: product.product_code,
        name: product.name,
        hsn_code: product.hsn_code || "",
        barcode: product.barcode || "",
        mrp: product.mrp || 0,
        unit_price: product.retail_price || product.mrp || 0,
        quantity: 1,
        cgst_pct: product.cgst_pct || 2.5,
        sgst_pct: product.sgst_pct || 2.5,
        current_stock: product.current_stock || 0,
        min_stock: product.min_stock || 0,
        unit: product.unit || "PCS",
        line_total: 0,
        taxable: 0,
        cgst_amount: 0,
        sgst_amount: 0,
      };
      this.recalcItem(item);
      this.items.push(item);
      this._save();
    },

    recalcItem(item) {
      const gross = item.unit_price * item.quantity;
      const gst = extractGST(gross, item.cgst_pct, item.sgst_pct);
      item.line_total = gross;
      item.taxable = gst.taxable;
      item.cgst_amount = gst.cgst;
      item.sgst_amount = gst.sgst;
    },

    removeItem(index) {
      this.items.splice(index, 1);
      this._save();
    },

    updateQty(index, qty) {
      if (qty < 1) qty = 1;
      this.items[index].quantity = qty;
      this.recalcItem(this.items[index]);
      this._save();
    },

    updatePrice(index, price) {
      this.items[index].unit_price = price;
      this.recalcItem(this.items[index]);
      this._save();
    },

    get subtotal() {
      return this.items.reduce((sum, i) => sum + i.line_total, 0);
    },
    get taxableTotal() {
      return this.items.reduce((sum, i) => sum + i.taxable, 0);
    },
    get cgstTotal() {
      return this.items.reduce((sum, i) => sum + i.cgst_amount, 0);
    },
    get sgstTotal() {
      return this.items.reduce((sum, i) => sum + i.sgst_amount, 0);
    },
    get grandTotal() {
      return this.subtotal - this.discountAmount;
    },
    get itemCount() {
      return this.items.reduce((sum, i) => sum + i.quantity, 0);
    },

    discountUp() {
      this.discountAmount = calcNextDiscount(this.subtotal, this.discountAmount);
      this._save();
    },

    discountDown() {
      this.discountAmount = calcPrevDiscount(this.subtotal, this.discountAmount);
      this._save();
    },

    setDiscount(amount) {
      this.discountAmount = Math.max(0, Math.min(amount, this.subtotal));
      this._save();
    },

    setStep(s) { this.step = s; this._save(); },
    setPaymentMethod(m) { this.paymentMethod = m; this._save(); },

    loadForEdit(invoice, items) {
      this.editingInvoiceId = invoice.id;
      this.editingInvoiceNumber = invoice.invoice_number;
      this.customerMobile = invoice.expand?.customer?.mobile || "";
      this.customerName = invoice.expand?.customer?.name || "";
      this.customer = invoice.expand?.customer || null;
      this.paymentMethod = invoice.payment_method || "cash";
      this.discountAmount = invoice.discount_total || 0;
      this.step = "products";
      this.items = items.map((item) => {
        const cartItem = {
          product_id: item.product,
          product_code: item.product_code || "",
          name: item.product_name,
          hsn_code: item.hsn_code || "",
          barcode: item.barcode || "",
          mrp: item.mrp || 0,
          unit_price: item.unit_price,
          quantity: item.quantity,
          cgst_pct: item.cgst_pct || 2.5,
          sgst_pct: item.sgst_pct || 2.5,
          current_stock: item.expand?.product?.current_stock || 0,
          min_stock: item.expand?.product?.min_stock || 0,
          unit: item.unit || "PCS",
          line_total: 0,
          taxable: 0,
          cgst_amount: 0,
          sgst_amount: 0,
        };
        this.recalcItem(cartItem);
        return cartItem;
      });
      this._save();
    },

    clear(keepCustomer = false) {
      this.items = [];
      this.discountAmount = 0;
      this.step = "products";
      this.editingInvoiceId = null;
      this.editingInvoiceNumber = null;
      if (!keepCustomer) {
        this.customer = null;
        this.customerMobile = "";
        this.customerName = "";
        this.paymentMethod = "cash";
      }
      this._save();
    },

    addQuickBillLines(count = 3) {
      // Find highest existing saree number to continue from
      let maxNum = 0;
      this.items.forEach(item => {
        const m = item.name.match(/^Saree - (\d+)$/);
        if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
      });
      for (let i = 1; i <= count; i++) {
        const num = maxNum + i;
        const item = {
          product_id: "quick_" + Date.now() + "_" + i,
          product_code: "",
          name: "Saree - " + num,
          hsn_code: "",
          barcode: "",
          mrp: 0,
          unit_price: 0,
          quantity: 1,
          cgst_pct: 2.5,
          sgst_pct: 2.5,
          current_stock: 0,
          min_stock: 0,
          unit: "PCS",
          line_total: 0,
          taxable: 0,
          cgst_amount: 0,
          sgst_amount: 0,
        };
        this.items.push(item);
      }
      this._save();
    },

    clearAll() {
      this.items = [];
      this.customer = null;
      this.discountAmount = 0;
      this.step = "products";
      this.customerMobile = "";
      this.customerName = "";
      this.paymentMethod = "cash";
      this.editingInvoiceId = null;
      this.editingInvoiceNumber = null;
      sessionStorage.removeItem("cart");
    },
  });

  // ===== SETTINGS STORE =====
  Alpine.store("settings", {
    data: {},
    loaded: false,
    async load() {
      if (this.loaded) return;
      try {
        this.data = await api.getSettings();
        this.loaded = true;
      } catch (e) {
        console.error("Failed to load settings:", e);
      }
    },
    get(key, fallback = "") {
      return this.data[key] || fallback;
    },
  });
});

// ===== ROUTER =====
function appRoot() {
  return {
    page: "login",
    pageParams: {},
    loading: false,
    toastMsg: "",
    toastType: "success",

    async init() {
      // Try to restore/refresh auth on init
      const loggedIn = await api.tryRefreshAuth();
      if (loggedIn) {
        Alpine.store("auth").init();
        Alpine.store("settings").load();
      }
      // Listen for hash changes
      window.addEventListener("hashchange", () => this.navigate());
      this.navigate();
    },

    navigate() {
      const hash = window.location.hash || "";
      const [path, ...rest] = hash.split("/").filter(Boolean);

      if (!api.isLoggedIn() && hash !== "#login") {
        this.page = "login";
        return;
      }

      const routes = {
        "": "dashboard",
        "#dashboard": "dashboard",
        "#invoice": "invoice-new",
        "#invoices": "invoice-list",
        "#products": "products",
        "#customers": "customers",
        "#suppliers": "suppliers",
        "#stock": "stock",
        "#reports": "reports",
        "#settings": "settings",
        "#users": "users",
        "#import": "import",
        "#more": "more",
      };

      // Handle parameterized routes: #invoice/VIEW_ID
      if (hash.startsWith("#invoice/") && rest.length > 0) {
        this.page = "invoice-view";
        this.pageParams = { id: rest[0] };
        return;
      }

      this.page = routes[hash] || routes[`#${path?.replace("#", "")}`] || "dashboard";
    },

    toast(msg, type = "success") {
      this.toastMsg = msg;
      this.toastType = type;
      setTimeout(() => { this.toastMsg = ""; }, 3000);
    },

    goto(page) {
      window.location.hash = page;
    },
  };
}

window.appRoot = appRoot;
