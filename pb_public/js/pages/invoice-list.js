function invoiceListPage() {
  return {
    invoices: [],
    loading: true,
    page: 1,
    totalPages: 1,

    async init() {
      await this.load();
    },

    async load() {
      this.loading = true;
      try {
        const result = await api.getInvoices('status != "revised"', this.page, 20);
        this.invoices = result.items;
        this.totalPages = result.totalPages;
      } catch (e) {
        console.error("Load invoices error:", e);
      } finally {
        this.loading = false;
      }
    },
  };
}
window.invoiceListPage = invoiceListPage;
