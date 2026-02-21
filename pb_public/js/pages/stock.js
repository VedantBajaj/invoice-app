function stockPage() {
  return {
    tab: "low", // low | negative | adjust | history
    lowStock: [],
    negativeStock: [],
    movements: [],
    loading: true,
    adjustProduct: null,
    adjustQty: 0,
    adjustType: "adjustment",
    adjustNote: "",
    searchQuery: "",
    searchResults: [],
    movementPage: 1,
    movementTotalPages: 1,

    async init() {
      await this.loadTab();
    },

    async loadTab() {
      this.loading = true;
      try {
        if (this.tab === "low") {
          const result = await api.getLowStockProducts();
          this.lowStock = result.items;
        } else if (this.tab === "negative") {
          const result = await api.getNegativeStockProducts();
          this.negativeStock = result.items;
        } else if (this.tab === "history") {
          const result = await api.getStockMovements("", this.movementPage);
          this.movements = result.items;
          this.movementTotalPages = result.totalPages;
        }
      } catch (e) {
        console.error("Stock load error:", e);
      } finally {
        this.loading = false;
      }
    },

    switchTab(t) {
      this.tab = t;
      this.loadTab();
    },

    async searchProduct() {
      if (this.searchQuery.length < 2) { this.searchResults = []; return; }
      try {
        const result = await api.searchProducts(this.searchQuery, 1, 10);
        this.searchResults = result.items;
      } catch (e) {
        console.error("Search error:", e);
      }
    },

    selectProduct(p) {
      this.adjustProduct = p;
      this.searchResults = [];
      this.searchQuery = p.name;
    },

    async submitAdjustment() {
      if (!this.adjustProduct || !this.adjustQty) return;
      try {
        const qty = parseInt(this.adjustQty);
        await api.createStockMovement({
          product: this.adjustProduct.id,
          type: this.adjustType,
          quantity: qty,
          note: this.adjustNote,
          user: api.getUser()?.id,
        });
        // Update product stock
        const newStock = this.adjustProduct.current_stock + qty;
        await api.updateProduct(this.adjustProduct.id, { current_stock: newStock });

        this.adjustProduct = null;
        this.adjustQty = 0;
        this.adjustNote = "";
        this.searchQuery = "";
        alert("Stock adjusted successfully");
      } catch (e) {
        console.error("Adjust stock error:", e);
        alert("Failed: " + e.message);
      }
    },

    movementLabel(type) {
      return { sale: "Sale", purchase: "Purchase", adjustment: "Adjust", opening: "Opening", return: "Return" }[type] || type;
    },

    movementColor(type) {
      return { sale: "text-red-500", purchase: "text-green-500", adjustment: "text-blue-500", opening: "text-gray-500", return: "text-orange-500" }[type] || "";
    },
  };
}
window.stockPage = stockPage;
