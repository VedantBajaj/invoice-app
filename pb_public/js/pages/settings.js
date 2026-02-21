function settingsPage() {
  return {
    settings: {},
    loading: true,
    saving: false,

    keys: [
      { key: "shop_name", label: "Shop Name" },
      { key: "shop_address", label: "Shop Address" },
      { key: "shop_phone", label: "Shop Phone" },
      { key: "shop_gstin", label: "GSTIN" },
      { key: "invoice_prefix", label: "Invoice Prefix" },
      { key: "financial_year", label: "Financial Year" },
      { key: "upi_id", label: "UPI ID" },
      { key: "default_cgst", label: "Default CGST %" },
      { key: "default_sgst", label: "Default SGST %" },
    ],

    async init() {
      try {
        this.settings = await api.getSettings();
      } catch (e) {
        console.error("Load settings error:", e);
      } finally {
        this.loading = false;
      }
    },

    async save() {
      this.saving = true;
      try {
        for (const { key } of this.keys) {
          if (this.settings[key] !== undefined) {
            await api.updateSetting(key, this.settings[key]);
          }
        }
        Alpine.store("settings").loaded = false;
        await Alpine.store("settings").load();
        alert("Settings saved");
      } catch (e) {
        console.error("Save settings error:", e);
        alert("Failed to save: " + e.message);
      } finally {
        this.saving = false;
      }
    },
  };
}
window.settingsPage = settingsPage;
