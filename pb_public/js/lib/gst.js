/**
 * GST calculation — INCLUSIVE pricing
 * Prices already include GST. We extract the breakdown for display.
 */
function extractGST(inclusiveAmount, cgstPct = 2.5, sgstPct = 2.5) {
  const totalTaxPct = cgstPct + sgstPct;
  const taxable = Math.round(inclusiveAmount / (1 + totalTaxPct / 100) * 100) / 100;
  const cgst = Math.round(taxable * cgstPct / 100 * 100) / 100;
  const sgst = Math.round(taxable * sgstPct / 100 * 100) / 100;
  return { taxable, cgst, sgst, total: Math.round((taxable + cgst + sgst) * 100) / 100 };
}

window.extractGST = extractGST;
