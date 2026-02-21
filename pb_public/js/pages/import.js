/**
 * Product Import page — parse XLSX, preview changes, apply
 *
 * Column mapping (from external app export):
 *   Product Code, Product Name, Barcode, Purchase Price,
 *   Retail Sale Price, MRP, Opening Qty, HSN Code,
 *   Discount %, CGST %, SGST %, CESS %, Wholesale Price,
 *   Sales Unit, Minimum Stock, Batch, Size, Colour, IMEI-1, IMEI-2,
 *   Description, Sub Category ID
 *
 * Match logic:  product_code (e.g. P-0843)
 * For existing:  update retail_price, mrp, purchase_price, current_stock (Opening Qty)
 * For new:       create full product record
 */
function importPage() {
  return {
    file: null,
    fileName: "",
    parsing: false,
    parsed: false,
    importing: false,
    importDone: false,

    // Preview data
    rows: [],          // all parsed rows
    newProducts: [],   // rows that don't match existing products
    updatedProducts: [],// rows that match existing products with changes
    unchangedCount: 0, // matched but no changes
    errorRows: [],     // rows with problems

    // Progress
    progress: 0,
    progressTotal: 0,
    progressMsg: "",

    // Summary after import
    summary: { created: 0, updated: 0, errors: 0, errorDetails: [] },

    // Filter view
    viewFilter: "all", // all, new, updated

    onFileSelect(event) {
      const f = event.target.files[0];
      if (!f) return;
      this.file = f;
      this.fileName = f.name;
      this.parsed = false;
      this.importDone = false;
      this.parseFile();
    },

    async parseFile() {
      if (!this.file) return;
      this.parsing = true;
      this.progressMsg = "Reading file...";
      try {
        const data = await this.file.arrayBuffer();
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        this.progressMsg = `Parsed ${jsonRows.length} rows. Matching with existing products...`;

        // Map columns to our schema
        this.rows = jsonRows.map((r) => ({
          product_code: String(r["Product Code"] || "").trim(),
          name: String(r["Product Name"] || "").trim(),
          description: String(r["Description"] || "").trim(),
          barcode: String(r["Barcode"] || "").trim(),
          hsn_code: String(r["HSN Code"] || "0").trim(),
          purchase_price: parseFloat(r["Purchase Price"]) || 0,
          retail_price: parseFloat(r["Retail Sale Price"]) || 0,
          mrp: parseFloat(r["MRP"]) || 0,
          wholesale_price: parseFloat(r["Wholesale Price"]) || 0,
          current_stock: parseFloat(r["Opening Qty"]) || 0,
          min_stock: parseFloat(r["Minimum Stock"]) || 0,
          discount_pct: parseFloat(r["Discount %"]) || 0,
          cgst_pct: parseFloat(r["CGST %"]) || 2.5,
          sgst_pct: parseFloat(r["SGST %"]) || 2.5,
          cess_pct: parseFloat(r["CESS %"]) || 0,
          unit: String(r["Sales Unit"] || "PCS").trim(),
          batch: String(r["Batch"] || "").trim(),
          size: String(r["Size"] || "").trim(),
          colour: String(r["Colour"] || "").trim(),
          imei_1: String(r["IMEI-1"] || "").trim(),
          imei_2: String(r["IMEI-2"] || "").trim(),
          sub_category: String(r["Sub Category ID"] || "").trim(),
          // Will be filled during matching
          _match: null,     // existing PB record if matched
          _action: "",      // "new", "update", "unchanged", "error"
          _changes: [],     // list of changed fields
          _error: "",
        }));

        // Fetch all existing products in batches for matching
        const existingMap = {};
        let page = 1;
        let hasMore = true;
        while (hasMore) {
          const result = await pb.collection("products").getList(page, 500, {
            fields: "id,product_code,name,barcode,retail_price,mrp,purchase_price,current_stock,wholesale_price,min_stock",
            requestKey: null,
          });
          result.items.forEach((p) => {
            existingMap[p.product_code] = p;
          });
          hasMore = page < result.totalPages;
          page++;
        }

        this.progressMsg = `Matching ${this.rows.length} rows against ${Object.keys(existingMap).length} existing products...`;

        // Match and classify
        this.newProducts = [];
        this.updatedProducts = [];
        this.unchangedCount = 0;
        this.errorRows = [];

        for (const row of this.rows) {
          if (!row.product_code || !row.name) {
            row._action = "error";
            row._error = "Missing product code or name";
            this.errorRows.push(row);
            continue;
          }

          const existing = existingMap[row.product_code];
          if (!existing) {
            row._action = "new";
            this.newProducts.push(row);
          } else {
            row._match = existing;
            // Check what changed
            const changes = [];
            if (Math.abs(existing.retail_price - row.retail_price) > 0.01) {
              changes.push({ field: "retail_price", old: existing.retail_price, new: row.retail_price });
            }
            if (Math.abs(existing.mrp - row.mrp) > 0.01) {
              changes.push({ field: "mrp", old: existing.mrp, new: row.mrp });
            }
            if (Math.abs(existing.purchase_price - row.purchase_price) > 0.01) {
              changes.push({ field: "purchase_price", old: existing.purchase_price, new: row.purchase_price });
            }
            if (Math.abs(existing.current_stock - row.current_stock) > 0.01) {
              changes.push({ field: "current_stock", old: existing.current_stock, new: row.current_stock });
            }
            if (existing.barcode !== row.barcode && row.barcode) {
              changes.push({ field: "barcode", old: existing.barcode, new: row.barcode });
            }
            if (Math.abs((existing.wholesale_price || 0) - row.wholesale_price) > 0.01) {
              changes.push({ field: "wholesale_price", old: existing.wholesale_price || 0, new: row.wholesale_price });
            }

            if (changes.length > 0) {
              row._action = "update";
              row._changes = changes;
              this.updatedProducts.push(row);
            } else {
              row._action = "unchanged";
              this.unchangedCount++;
            }
          }
        }

        this.parsed = true;
        this.progressMsg = "";
      } catch (e) {
        console.error("Parse error:", e);
        this.progressMsg = "Error parsing file: " + e.message;
      } finally {
        this.parsing = false;
      }
    },

    async startImport() {
      if (this.importing) return;
      this.importing = true;
      this.summary = { created: 0, updated: 0, errors: 0, errorDetails: [] };

      const toCreate = this.newProducts;
      const toUpdate = this.updatedProducts;
      this.progressTotal = toCreate.length + toUpdate.length;
      this.progress = 0;

      // Create new products
      for (const row of toCreate) {
        this.progressMsg = `Creating: ${row.name}`;
        try {
          await api.createProduct({
            product_code: row.product_code,
            name: row.name,
            description: row.description || row.name,
            barcode: row.barcode,
            hsn_code: row.hsn_code,
            purchase_price: row.purchase_price,
            retail_price: row.retail_price,
            mrp: row.mrp,
            wholesale_price: row.wholesale_price,
            current_stock: row.current_stock,
            min_stock: row.min_stock,
            discount_pct: row.discount_pct,
            cgst_pct: row.cgst_pct,
            sgst_pct: row.sgst_pct,
            cess_pct: row.cess_pct,
            unit: row.unit,
            batch: row.batch,
            size: row.size,
            colour: row.colour,
            imei_1: row.imei_1,
            imei_2: row.imei_2,
            active: true,
          });
          row._action = "created";
          this.summary.created++;
        } catch (e) {
          // Fallback: if create failed (duplicate), try to find and update instead
          console.warn("Create failed for", row.product_code, "— trying update fallback:", e.message);
          try {
            const existing = await pb.collection("products").getFirstListItem(
              'product_code="' + row.product_code + '"',
              { fields: "id", requestKey: null }
            );
            await api.updateProduct(existing.id, {
              name: row.name, retail_price: row.retail_price, mrp: row.mrp,
              purchase_price: row.purchase_price, current_stock: row.current_stock,
              barcode: row.barcode, wholesale_price: row.wholesale_price,
            });
            row._action = "updated";
            this.summary.updated++;
          } catch (e2) {
            console.error("Create+update fallback failed:", row.product_code, e2);
            row._action = "error";
            row._error = e.message || "Creation failed";
            this.summary.errors++;
            this.summary.errorDetails.push(row.product_code + " (" + row.name + "): " + (e.message || "failed"));
          }
        }
        this.progress++;
      }

      // Update existing products
      for (const row of toUpdate) {
        this.progressMsg = `Updating: ${row.name}`;
        try {
          const updateData = {};
          for (const ch of row._changes) {
            updateData[ch.field] = ch.new;
          }
          await api.updateProduct(row._match.id, updateData);
          row._action = "updated";
          this.summary.updated++;
        } catch (e) {
          console.error("Update error:", row.product_code, e);
          row._action = "error";
          row._error = e.message || "Update failed";
          this.summary.errors++;
          this.summary.errorDetails.push(row.product_code + " (" + row.name + "): " + (e.message || "update failed"));
        }
        this.progress++;
      }

      this.importing = false;
      this.importDone = true;
      this.progressMsg = "";
    },

    get filteredPreview() {
      if (this.viewFilter === "new") return this.newProducts;
      if (this.viewFilter === "updated") return this.updatedProducts;
      return [...this.newProducts, ...this.updatedProducts, ...this.errorRows];
    },

    changeLabel(ch) {
      const labels = {
        retail_price: "Price",
        mrp: "MRP",
        purchase_price: "Purchase",
        current_stock: "Stock",
        barcode: "Barcode",
        wholesale_price: "W.Sale",
      };
      return `${labels[ch.field] || ch.field}: ${ch.old} → ${ch.new}`;
    },

    formatCurrency(n) {
      return "₹" + (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },

    reset() {
      this.file = null;
      this.fileName = "";
      this.parsed = false;
      this.importDone = false;
      this.rows = [];
      this.newProducts = [];
      this.updatedProducts = [];
      this.unchangedCount = 0;
      this.errorRows = [];
      this.progress = 0;
      this.progressTotal = 0;
      this.progressMsg = "";
      // Reset file input
      const input = this.$refs.fileInput;
      if (input) input.value = "";
    },
  };
}
window.importPage = importPage;
