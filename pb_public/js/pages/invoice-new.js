function invoiceNewPage() {
  return {
    searchQuery: "",
    barcodeInput: "",
    searchResults: [],
    searching: false,
    successInvoice: null,
    customerSearching: false,
    submitting: false,
    // Quick-add product
    showQuickAdd: false,
    quickAddBarcode: "",
    quickAddName: "",
    quickAddPrice: "",
    quickAddSaving: false,

    // Persisted via store
    get step() { return Alpine.store("cart").step; },
    set step(v) { Alpine.store("cart").setStep(v); },
    get invoiceMobile() { return Alpine.store("cart").customerMobile; },
    set invoiceMobile(v) { Alpine.store("cart").customerMobile = v; Alpine.store("cart")._save(); },
    get invoiceCustomerName() { return Alpine.store("cart").customerName; },
    set invoiceCustomerName(v) { Alpine.store("cart").customerName = v; Alpine.store("cart")._save(); },
    get paymentMethod() { return Alpine.store("cart").paymentMethod; },
    set paymentMethod(v) { Alpine.store("cart").setPaymentMethod(v); },

    init() {
      // Pre-load cash customer object for default use
      const cart = Alpine.store("cart");
      if (!cart.customer) {
        api.getCustomerByMobile("0000000000").then((c) => {
          if (c) cart.customer = c;
        });
      }
    },

    // ===== CUSTOMER LOOKUP (on mobile input) =====
    async lookupCustomer() {
      if (this.invoiceMobile.length < 10) return;
      this.customerSearching = true;
      try {
        const c = await api.getCustomerByMobile(this.invoiceMobile);
        if (c) {
          this.invoiceCustomerName = c.name;
          Alpine.store("cart").customer = c;
          Alpine.store("cart")._save();
        }
      } catch {}
      finally { this.customerSearching = false; }
    },

    // ===== PRODUCT SEARCH =====
    async searchProduct() {
      if (!this.searchQuery || this.searchQuery.length < 2) {
        this.searchResults = [];
        return;
      }
      this.searching = true;
      try {
        const result = await api.searchProducts(this.searchQuery, 1, 10);
        this.searchResults = result.items;
      } catch { this.searchResults = []; }
      finally { this.searching = false; }
    },

    async lookupBarcode() {
      if (!this.barcodeInput) return;
      this.showQuickAdd = false;
      const product = await api.getProductByBarcode(this.barcodeInput);
      if (product) {
        Alpine.store("cart").addItem(product);
        this.barcodeInput = "";
        if (navigator.vibrate) navigator.vibrate(50);
      } else {
        // Show quick-add form pre-filled with barcode
        this.quickAddBarcode = this.barcodeInput;
        this.quickAddName = "";
        this.quickAddPrice = "";
        this.showQuickAdd = true;
        this.barcodeInput = "";
      }
    },

    async quickAddProduct() {
      if (!this.quickAddName || !this.quickAddPrice) return;
      this.quickAddSaving = true;
      try {
        const settings = Alpine.store("settings");
        const productCode = await api.getNextProductCode();
        const product = await api.createProduct({
          name: this.quickAddName,
          barcode: this.quickAddBarcode || "",
          product_code: productCode,
          retail_price: parseFloat(this.quickAddPrice),
          mrp: parseFloat(this.quickAddPrice),
          cgst_pct: parseFloat(settings.get("default_cgst", "2.5")),
          sgst_pct: parseFloat(settings.get("default_sgst", "2.5")),
          unit: "PCS",
          current_stock: 0,
          min_stock: 5,
          active: true,
        });
        Alpine.store("cart").addItem(product);
        this.showQuickAdd = false;
        this.quickAddName = "";
        this.quickAddPrice = "";
        this.quickAddBarcode = "";
        if (navigator.vibrate) navigator.vibrate(50);
      } catch (e) {
        console.error("Quick add product error:", e);
        this.$dispatch("toast", { msg: "Failed to create product", type: "error" });
      } finally {
        this.quickAddSaving = false;
      }
    },

    openQuickAddFromSearch() {
      this.quickAddName = this.searchQuery;
      this.quickAddBarcode = "";
      this.quickAddPrice = "";
      this.showQuickAdd = true;
      this.searchQuery = "";
      this.searchResults = [];
    },

    addToCart(product) {
      Alpine.store("cart").addItem(product);
      this.searchQuery = "";
      this.searchResults = [];
      if (navigator.vibrate) navigator.vibrate(50);
    },

    stockClass(product) {
      if (product.current_stock < -10) return "stock-critical";
      if (product.current_stock < 0) return "stock-negative";
      if (product.current_stock < product.min_stock) return "stock-low";
      return "stock-ok";
    },

    // ===== GENERATE / UPDATE INVOICE =====
    async generateInvoice() {
      const cart = Alpine.store("cart");
      if (cart.items.length === 0) return;

      // Block if any item has zero price
      const zeroPriceCount = cart.items.filter(i => !i.unit_price || i.unit_price <= 0).length;
      if (zeroPriceCount > 0) {
        // Highlight zero-price inputs with red ring
        document.querySelectorAll('input[inputmode="decimal"]').forEach((inp) => {
          if (inp.placeholder === "0" || inp.placeholder === "Price (₹)") {
            inp.classList.add("ring-2", "ring-red-400");
            setTimeout(() => inp.classList.remove("ring-2", "ring-red-400"), 2000);
          }
        });
        this.$dispatch("toast", { msg: zeroPriceCount + " item(s) missing price", type: "error" });
        return;
      }

      this.submitting = true;

      try {
        // Resolve customer: lookup by mobile, create if needed, or use cash
        let customer = cart.customer;
        const mobile = this.invoiceMobile?.trim();
        const name = this.invoiceCustomerName?.trim();

        if (mobile && mobile.length >= 10 && mobile !== "0000000000") {
          let c = await api.getCustomerByMobile(mobile);
          if (!c) {
            c = await api.createCustomer({
              name: name || "Customer",
              mobile: mobile,
              state: "Madhya Pradesh",
            });
          }
          customer = c;
        } else if (!customer) {
          customer = await api.getCustomerByMobile("0000000000");
        }

        const gst = extractGST(cart.grandTotal);
        const invoiceData = {
          customer: customer.id,
          tax_type: "GST",
          subtotal: Math.round(cart.subtotal * 100) / 100,
          discount_total: Math.round(cart.discountAmount * 100) / 100,
          cgst_total: Math.round(gst.cgst * 100) / 100,
          sgst_total: Math.round(gst.sgst * 100) / 100,
          grand_total: Math.round(cart.grandTotal * 100) / 100,
          amount_paid: Math.round(cart.grandTotal * 100) / 100,
          payment_method: this.paymentMethod,
          status: "completed",
          created_by: api.getUser()?.id || "",
        };

        let invoice;

        if (cart.isEditing) {
          // EDIT MODE: mark old as revised, create new row with same invoice number
          await api.updateInvoice(cart.editingInvoiceId, { status: "revised" });
          invoice = await api.createInvoice({
            ...invoiceData,
            invoice_number: cart.editingInvoiceNumber,
            invoice_date: new Date().toISOString(),
          });
        } else {
          // NEW MODE: get next invoice number
          const { number: invoiceNumber, counter } = await api.getNextInvoiceNumber();
          invoice = await api.createInvoice({
            ...invoiceData,
            invoice_number: invoiceNumber,
            invoice_date: new Date().toISOString(),
          });
          await api.incrementInvoiceCounter(counter);
        }

        // Save items — snapshot cart items first to avoid reactivity issues
        const itemsToSave = cart.items.map(item => ({
          invoice: invoice.id,
          product: item.product_id?.startsWith("quick_") ? "" : item.product_id,
          product_name: item.name,
          product_code: item.product_code || "",
          hsn_code: item.hsn_code || "",
          barcode: item.barcode || "",
          quantity: item.quantity,
          unit: item.unit || "PCS",
          unit_price: item.unit_price,
          mrp: item.mrp || 0,
          taxable_amount: Math.round(item.taxable * 100) / 100,
          cgst_pct: item.cgst_pct,
          cgst_amount: Math.round(item.cgst_amount * 100) / 100,
          sgst_pct: item.sgst_pct,
          sgst_amount: Math.round(item.sgst_amount * 100) / 100,
          total: Math.round(item.line_total * 100) / 100,
        }));

        console.log(`Saving ${itemsToSave.length} items for invoice ${invoice.id}`);
        for (const itemData of itemsToSave) {
          await api.createInvoiceItem(itemData);
        }
        console.log("All items saved successfully");

        const invoiceId = invoice.id;
        Alpine.store("cart").clear(true);  // keep customer for next invoice
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        window.location.hash = `#invoice/${invoiceId}`;
      } catch (e) {
        console.error("Invoice creation error:", e);
        this.$dispatch("toast", { msg: "Failed to save invoice", type: "error" });
      } finally {
        this.submitting = false;
      }
    },

    newInvoice() {
      this.searchQuery = "";
      this.barcodeInput = "";
      this.searchResults = [];
      this.successInvoice = null;
      this.successMobile = "";
      Alpine.store("cart").clearAll();
    },

    formatCurrency(n) {
      return "₹" + (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },
  };
}
window.invoiceNewPage = invoiceNewPage;
