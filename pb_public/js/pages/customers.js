function customersPage() {
  return {
    customers: [],
    searchQuery: "",
    loading: true,

    async init() {
      await this.search();
    },

    async search() {
      this.loading = true;
      try {
        const result = await api.searchCustomers(this.searchQuery);
        this.customers = result.items;
      } catch (e) {
        console.error("Customers search error:", e);
      } finally {
        this.loading = false;
      }
    },
  };
}
window.customersPage = customersPage;
