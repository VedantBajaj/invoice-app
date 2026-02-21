function dashboardPage() {
  return {
    stats: { todayCount: 0, todayTotal: 0, lowStockCount: 0, negativeStockCount: 0 },
    recentInvoices: [],
    loading: true,

    async init() {
      try {
        const [stats, recent] = await Promise.all([
          api.getDashboardStats(),
          api.getInvoices('status != "revised"', 1, 5),
        ]);
        this.stats = stats;
        this.recentInvoices = recent.items;
      } catch (e) {
        console.error("Dashboard load error:", e);
      } finally {
        this.loading = false;
      }
    },

    formatCurrency(n) {
      return "₹" + (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    },
  };
}
window.dashboardPage = dashboardPage;
