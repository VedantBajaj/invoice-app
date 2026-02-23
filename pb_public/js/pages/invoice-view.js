function invoiceViewPage() {
  return {
    invoice: null,
    items: [],
    loading: true,
    saving: false,
    showAdjustment: false,

    async init() {
      await Alpine.store("settings").load();
      const hash = window.location.hash || "";
      const parts = hash.split("/");
      const id = parts[1] || "";
      if (!id) return;
      try {
        const [inv, itemsResult] = await Promise.all([
          api.getInvoice(id),
          api.getInvoiceItems(id),
        ]);
        this.invoice = inv;
        this.items = itemsResult;
        if ((inv.adjustment || 0) > 0) this.showAdjustment = true;
      } catch (e) {
        console.error("Load invoice error:", e);
      } finally {
        this.loading = false;
      }
    },

    fmt(n) {
      return (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },

    fmtDate(d) {
      return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    },

    get shopName() { return Alpine.store("settings").get("shop_name", "Store"); },
    get shopAddress() { return Alpine.store("settings").get("shop_address", ""); },
    get shopPhone() { return Alpine.store("settings").get("shop_phone", ""); },
    get shopGSTIN() { return Alpine.store("settings").get("shop_gstin", ""); },

    get customerName() { return this.invoice?.expand?.customer?.name || "Cash"; },
    get customerMobile() { return this.invoice?.expand?.customer?.mobile || ""; },
    get hasUpiId() { const id = Alpine.store("settings").get("upi_id"); return id && id !== "-"; },
    get isRevised() { return this.invoice?.status === "revised"; },
    get createdByName() { return this.invoice?.expand?.created_by?.name || ""; },

    editInvoice() {
      if (!this.invoice || this.isRevised) return;
      Alpine.store("cart").loadForEdit(this.invoice, this.items);
      window.location.hash = "#invoice";
    },

    // Adjustment editing (post-invoice price negotiation)
    adjustmentUp() {
      if (!this.invoice) return;
      const afterDiscount = this.invoice.subtotal - this.invoice.discount_total;
      const newAdj = calcNextDiscount(afterDiscount, this.invoice.adjustment || 0);
      this.applyAdjustment(newAdj);
    },

    adjustmentDown() {
      if (!this.invoice) return;
      const afterDiscount = this.invoice.subtotal - this.invoice.discount_total;
      const newAdj = calcPrevDiscount(afterDiscount, this.invoice.adjustment || 0);
      this.applyAdjustment(newAdj);
    },

    setAdjustment(amount) {
      if (!this.invoice) return;
      const maxAdj = this.invoice.subtotal - this.invoice.discount_total;
      amount = Math.max(0, Math.min(amount, maxAdj));
      this.applyAdjustment(amount);
    },

    async applyAdjustment(adjustment) {
      const inv = this.invoice;
      adjustment = Math.round(adjustment * 100) / 100;
      const grandTotal = Math.round((inv.subtotal - inv.discount_total - adjustment) * 100) / 100;
      const gst = extractGST(grandTotal);

      this.saving = true;
      try {
        await api.updateInvoice(inv.id, {
          adjustment: adjustment,
          grand_total: grandTotal,
          cgst_total: gst.cgst,
          sgst_total: gst.sgst,
          amount_paid: grandTotal,
        });
        // Update local state
        inv.adjustment = adjustment;
        inv.grand_total = grandTotal;
        inv.cgst_total = gst.cgst;
        inv.sgst_total = gst.sgst;
        inv.amount_paid = grandTotal;
      } catch (e) {
        console.error("Update adjustment error:", e);
      } finally {
        this.saving = false;
      }
    },

    async shareImage() {
      if (!this.invoice) return;
      const inv = this.invoice;
      const doc = document.querySelector(".invoice-doc");
      if (doc && typeof html2canvas === "function") {
        try {
          const canvas = await html2canvas(doc, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
          const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
          const file = new File([blob], `${inv.invoice_number}.png`, { type: "image/png" });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: inv.invoice_number, text: `Invoice ${inv.invoice_number} — ₹${this.fmt(inv.grand_total)}` });
            return;
          }
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a"); a.href = url; a.download = `${inv.invoice_number}.png`; a.click();
          URL.revokeObjectURL(url);
        } catch (e) {
          if (e.name === "AbortError") return;
          console.error("Image share failed:", e);
        }
      }
    },

    shareWhatsApp() {
      if (!this.invoice) return;
      const inv = this.invoice;
      const gst = inv.cgst_total + inv.sgst_total;
      const hasDiscount = inv.discount_total > 0;
      const hasAdjustment = (inv.adjustment || 0) > 0;

      // Helpers
      const rpad = (s, w) => s + " ".repeat(Math.max(0, w - s.length));
      const lpad = (s, w) => " ".repeat(Math.max(0, w - s.length)) + s;
      // Whole number format (no decimals) with Indian comma grouping
      const whole = (n) => Math.round(n || 0).toLocaleString("en-IN");

      // Layout
      const W = 30;
      const AMT_W = 8;
      const QTY_W = 3;
      const SEP = "|";
      const NAME_W = W - AMT_W - QTY_W - 2; // 17

      // Center a string within width W
      const center = (s, w) => {
        const pad = Math.max(0, w - s.length);
        const left = Math.floor(pad / 2);
        return " ".repeat(left) + s;
      };

      const lines = [];

      // Monospace block
      const t = [];

      // Shop header — centered
      t.push(center(this.shopName, W));
      if (this.shopAddress) t.push(center(this.shopAddress, W));
      if (this.shopPhone) t.push(center("Ph: " + this.shopPhone, W));
      if (this.shopGSTIN) t.push(center("GSTIN: " + this.shopGSTIN, W));
      t.push("-".repeat(W));
      t.push(`Inv: ${inv.invoice_number}`);
      t.push(`${this.fmtDate(inv.invoice_date)}`);
      t.push(`${this.customerName}`);
      t.push("-".repeat(W));

      // Header
      t.push(rpad("Item", NAME_W) + SEP + lpad("Qty", QTY_W) + SEP + lpad("Amount", AMT_W));
      t.push("-".repeat(W));

      // Items — whole numbers, right-aligned
      this.items.forEach((item) => {
        let name = item.product_name;
        if (name.length > NAME_W) name = name.substring(0, NAME_W - 1) + "…";
        const qty = `${item.quantity}`;
        const amt = whole(item.total);
        t.push(rpad(name, NAME_W) + SEP + lpad(qty, QTY_W) + SEP + lpad(amt, AMT_W));
      });

      t.push("-".repeat(W));

      const totalQty = this.items.reduce((s, i) => s + i.quantity, 0);

      // Totals row helper — label left, amount right-aligned in AMT_W
      const totalRow = (label, amt) => rpad(label, W - AMT_W) + lpad(amt, AMT_W);

      if (hasDiscount || hasAdjustment) {
        t.push(rpad("Subtotal", NAME_W) + SEP + lpad(`${totalQty}`, QTY_W) + SEP + lpad(whole(inv.subtotal), AMT_W));
        if (hasDiscount) t.push(totalRow("Discount", "-" + whole(inv.discount_total)));
        if (hasAdjustment) t.push(totalRow("Adjustment", "-" + whole(inv.adjustment)));
        t.push("-".repeat(W));
      }
      // TOTAL line with qty centered
      t.push(rpad("TOTAL", NAME_W) + SEP + lpad(`${totalQty}`, QTY_W) + SEP + lpad(whole(inv.grand_total), AMT_W));
      t.push("");
      t.push(`Payment: ${inv.payment_method}`);
      t.push("-".repeat(W));

      lines.push("```");
      t.forEach(l => lines.push(l));
      lines.push("```");
      lines.push(`_Thank you for your purchase!_`);

      // Normalize mobile: strip +, spaces, leading 91 if 12+ digits, then prepend 91
      let mobile = (this.customerMobile || "").replace(/[\s+\-]/g, "");
      if (mobile.startsWith("91") && mobile.length > 10) mobile = mobile.slice(2);
      const text = encodeURIComponent(lines.join("\n"));
      if (mobile && mobile.length >= 10 && mobile !== "0000000000") {
        window.open(`https://wa.me/91${mobile}?text=${text}`, "_blank");
      } else {
        window.open(`https://wa.me/?text=${text}`, "_blank");
      }
    },
  };
}
window.invoiceViewPage = invoiceViewPage;
