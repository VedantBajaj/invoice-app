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
    addPurchasePrice: "",
    addPrice: "",
    addSaving: false,

    // Product detail modal
    selected: null,

    // Barcode scanner state
    showScanner: false,
    scanError: "",
    _scanner: null,
    _scanBuffer: [],
    _scanProcessing: false,
    _navCleanup: null,

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

    // ===== BARCODE SCANNER (Quagga2) =====
    async openScanner() {
      this.scanError = "";

      // Request camera permission FIRST (preserves iOS user-gesture chain)
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
      } catch (err) {
        console.error("Camera permission error:", err);
        const msg = String(err);
        if (msg.includes("NotAllowedError") || msg.includes("Permission")) {
          this.scanError = "Camera permission denied. Check browser settings.";
        } else if (msg.includes("NotFoundError")) {
          this.scanError = "No camera found on this device.";
        } else {
          this.scanError = "Could not access camera. Try again.";
        }
        this.showScanner = true;
        return;
      }
      // Stop pre-request stream — Quagga will open its own
      stream.getTracks().forEach((t) => t.stop());

      // Show the scanner div
      this.showScanner = true;
      await this.$nextTick();

      try {
        await new Promise((resolve, reject) => {
          Quagga.init({
            inputStream: {
              name: "Live",
              type: "LiveStream",
              target: document.getElementById("products-barcode-scanner"),
              constraints: {
                facingMode: "environment",
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
            },
            decoder: {
              readers: [
                "ean_reader",
                "ean_8_reader",
                "code_128_reader",
                "code_39_reader",
                "upc_reader",
                "upc_e_reader",
                "i2of5_reader",
              ],
              multiple: false,
            },
            locate: true,
            frequency: 15,
          }, (err) => {
            if (err) { reject(err); return; }
            Quagga.start();
            resolve();
          });
        });

        this._scanner = true;
        this._scanBuffer = [];
        Quagga.onDetected((result) => {
          const code = result.codeResult.code;
          if (!code || this._scanProcessing) return;
          // Accept when same code appears 2+ times (fast confirmation)
          this._scanBuffer.push(code);
          if (this._scanBuffer.length > 8) this._scanBuffer.shift();
          const count = this._scanBuffer.filter(c => c === code).length;
          if (count >= 2) {
            this.onBarcodeScanned(code);
          }
        });

        // Cleanup if user navigates away
        this._navCleanup = () => this.closeScanner();
        window.addEventListener("hashchange", this._navCleanup, { once: true });
      } catch (err) {
        console.error("Scanner start error:", err);
        this.scanError = "Scanner error: " + (err.message || err);
      }
    },

    async closeScanner() {
      if (this._navCleanup) {
        window.removeEventListener("hashchange", this._navCleanup);
        this._navCleanup = null;
      }
      if (this._scanner) {
        try {
          Quagga.offDetected();
          Quagga.stop();
        } catch (e) { console.warn("Scanner stop:", e); }
        this._scanner = null;
      }
      this.showScanner = false;
      this.scanError = "";
      this._scanProcessing = false;
      this._scanBuffer = [];
    },

    async onBarcodeScanned(code) {
      if (this._scanProcessing || !code) return;
      this._scanProcessing = true;
      if (navigator.vibrate) navigator.vibrate(100);
      this.closeScanner();

      // Search for the scanned barcode and open detail if found
      try {
        // Try exact match first, then search (barcode field may store short codes)
        let product = await api.getProductByBarcode(code);
        if (!product) {
          const results = await api.searchProducts(code, 1, 5);
          if (results.items.length === 1) {
            product = results.items[0];
          }
        }
        if (product) {
          this.openDetail(product);
        } else {
          this.searchQuery = code;
          await this.search();
        }
      } catch (e) {
        console.error("Barcode lookup error:", e);
        this.searchQuery = code;
        await this.search();
      }
    },

    async addProduct() {
      if (!this.addPrice) return;
      this.addSaving = true;
      try {
        const productCode = await api.getNextProductCode();
        await api.createProduct({
          name: this.addName.trim() || "__auto__",
          barcode: this.addBarcode.trim() || "",
          product_code: productCode,
          purchase_price: parseFloat(this.addPurchasePrice) || 0,
          retail_price: parseFloat(this.addPrice) || 0,
          stock: 0,
        });
        this.addName = "";
        this.addBarcode = "";
        this.addPurchasePrice = "";
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
