function suppliersPage() {
  return {
    suppliers: [],
    searchQuery: "",
    loading: true,
    editing: null,

    async init() {
      await this.search();
    },

    async search() {
      this.loading = true;
      try {
        const result = await api.searchSuppliers(this.searchQuery);
        this.suppliers = result.items;
      } catch (e) {
        console.error("Suppliers search error:", e);
      } finally {
        this.loading = false;
      }
    },

    edit(s) {
      this.editing = { ...s };
    },

    cancelEdit() {
      this.editing = null;
    },

    async saveEdit() {
      try {
        await api.updateSupplier(this.editing.id, {
          name: this.editing.name,
          mobile: this.editing.mobile,
          gstin: this.editing.gstin,
          address: this.editing.address,
          city: this.editing.city,
          state: this.editing.state,
        });
        this.editing = null;
        await this.search();
      } catch (e) {
        console.error("Save supplier error:", e);
        alert("Failed to save: " + e.message);
      }
    },
  };
}
window.suppliersPage = suppliersPage;
