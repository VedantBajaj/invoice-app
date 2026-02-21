import { describe, it } from "node:test";
import assert from "node:assert/strict";

// GST-INCLUSIVE pricing: sale price already includes GST
// Extract taxable amount and GST components from inclusive price
function extractGST(inclusiveAmount, cgstPct = 2.5, sgstPct = 2.5) {
  const totalTaxPct = cgstPct + sgstPct;
  const taxable = Math.round(inclusiveAmount / (1 + totalTaxPct / 100) * 100) / 100;
  const cgst = Math.round(taxable * cgstPct / 100 * 100) / 100;
  const sgst = Math.round(taxable * sgstPct / 100 * 100) / 100;
  return {
    taxable,
    cgst,
    sgst,
    total: Math.round((taxable + cgst + sgst) * 100) / 100,
  };
}

describe("GST Extraction (Inclusive Pricing)", () => {
  it("extracts GST from 1050 (5% total GST on 1000 base)", () => {
    const result = extractGST(1050);
    assert.equal(result.taxable, 1000);
    assert.equal(result.cgst, 25);
    assert.equal(result.sgst, 25);
    assert.equal(result.total, 1050);
  });

  it("handles round inclusive price 500", () => {
    const result = extractGST(500);
    // 500 / 1.05 = 476.19047... -> 476.19
    assert.equal(result.taxable, 476.19);
    assert.equal(result.cgst, 11.90);
    assert.equal(result.sgst, 11.90);
  });

  it("handles zero", () => {
    const result = extractGST(0);
    assert.equal(result.taxable, 0);
    assert.equal(result.cgst, 0);
    assert.equal(result.sgst, 0);
  });

  it("handles 18% GST (9% + 9%)", () => {
    const result = extractGST(1180, 9, 9);
    assert.equal(result.taxable, 1000);
    assert.equal(result.cgst, 90);
    assert.equal(result.sgst, 90);
    assert.equal(result.total, 1180);
  });

  it("real-world saree price 700 inclusive at 5%", () => {
    const result = extractGST(700);
    // 700 / 1.05 = 666.6666... -> 666.67
    assert.equal(result.taxable, 666.67);
    assert.equal(result.cgst, 16.67);
    assert.equal(result.sgst, 16.67);
  });

  it("small amount 50 inclusive", () => {
    const result = extractGST(50);
    // 50 / 1.05 = 47.619... -> 47.62
    assert.equal(result.taxable, 47.62);
    assert.equal(result.cgst, 1.19);
    assert.equal(result.sgst, 1.19);
  });
});
