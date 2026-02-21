function productsPage() {
  return {
    products: [],
    searchQuery: "",
    loading: true,
    page: 1,
    totalPages: 1,
    showAddForm: false,
    addName: "",
    addBarcode: "",
    addPrice: "",
    addSaving: false,

    // Product detail modal
    selected: null,

    async init() {
      await this.search();
    },

    async search() {
      this.loading = true;
      try {
        const result = await api.searchProducts(this.searchQuery, this.page, 50);
        this.products = result.items;
        this.totalPages = result.totalPages;
      } catch (e) {
        console.error("Products search error:", e);
      } finally {
        this.loading = false;
      }
    },

    openDetail(product) {
      this.selected = product;
    },

    closeDetail() {
      this.selected = null;
    },

    async addProduct() {
      if (!this.addName || !this.addPrice) return;
      this.addSaving = true;
      try {
        const productCode = await api.getNextProductCode();
        await api.createProduct({
          name: this.addName.trim(),
          barcode: this.addBarcode.trim() || "",
          product_code: productCode,
          retail_price: parseFloat(this.addPrice) || 0,
          stock: 0,
        });
        this.addName = "";
        this.addBarcode = "";
        this.addPrice = "";
        this.showAddForm = false;
        await this.search();
      } catch (e) {
        console.error("Add product error:", e);
      } finally {
        this.addSaving = false;
      }
    },
  };
}
window.productsPage = productsPage;
