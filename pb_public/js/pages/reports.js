function reportsPage() {
  return {
    tab: "daily", // daily | product | gst | lowstock
    loading: false,
    dateFrom: new Date().toISOString().split("T")[0],
    dateTo: new Date().toISOString().split("T")[0],
    dailyData: [],
    dailyTotals: { count: 0, subtotal: 0, discount: 0, cgst: 0, sgst: 0, grand: 0 },
    productData: [],
    gstData: [],
    lowStockData: [],

    async init() {
      await this.loadReport();
    },

    switchTab(t) {
      this.tab = t;
      this.loadReport();
    },

    async loadReport() {
      this.loading = true;
      try {
        if (this.tab === "daily") await this.loadDaily();
        else if (this.tab === "product") await this.loadProductWise();
        else if (this.tab === "gst") await this.loadGST();
        else if (this.tab === "lowstock") await this.loadLowStock();
      } catch (e) {
        console.error("Report error:", e);
      } finally {
        this.loading = false;
      }
    },

    async loadDaily() {
      const result = await api.getInvoicesByDateRange(this.dateFrom, this.dateTo + " 23:59:59");
      this.dailyData = result.items;
      this.dailyTotals = {
        count: result.items.length,
        subtotal: result.items.reduce((s, i) => s + (i.subtotal || 0), 0),
        discount: result.items.reduce((s, i) => s + (i.discount_total || 0), 0),
        cgst: result.items.reduce((s, i) => s + (i.cgst_total || 0), 0),
        sgst: result.items.reduce((s, i) => s + (i.sgst_total || 0), 0),
        grand: result.items.reduce((s, i) => s + (i.grand_total || 0), 0),
      };
    },

    async loadProductWise() {
      const result = await api.getInvoicesByDateRange(this.dateFrom, this.dateTo + " 23:59:59");
      const invoiceIds = result.items.map(i => i.id);
      const items = await api.getAllInvoiceItemsForInvoices(invoiceIds);
      // Group by product
      const map = {};
      items.forEach(item => {
        const key = item.product || item.product_name;
        if (!map[key]) {
          map[key] = { name: item.product_name, qty: 0, total: 0 };
        }
        map[key].qty += item.quantity;
        map[key].total += item.total;
      });
      this.productData = Object.values(map).sort((a, b) => b.total - a.total);
    },

    async loadGST() {
      const result = await api.getInvoicesByDateRange(this.dateFrom, this.dateTo + " 23:59:59");
      this.gstData = result.items;
    },

    async loadLowStock() {
      const result = await api.getLowStockProducts();
      this.lowStockData = result.items;
    },

    fmt(n) {
      return "₹" + (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    },
  };
}
window.reportsPage = reportsPage;
