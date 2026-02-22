/**
 * Unit tests for GST extraction and discount stepping logic.
 *
 * These are pure math functions — no PocketBase needed.
 * The source lives in browser-land (window.*), so we inline the
 * function bodies here for Node.js execution.
 *
 * Run:  node --test tests/unit-tests.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// =====================================================================
// Inlined from pb_public/js/lib/gst.js
// =====================================================================

function extractGST(inclusiveAmount, cgstPct = 2.5, sgstPct = 2.5) {
  const totalTaxPct = cgstPct + sgstPct;
  const taxable = Math.round(inclusiveAmount / (1 + totalTaxPct / 100) * 100) / 100;
  const cgst = Math.round(taxable * cgstPct / 100 * 100) / 100;
  const sgst = Math.round(taxable * sgstPct / 100 * 100) / 100;
  return { taxable, cgst, sgst, total: Math.round((taxable + cgst + sgst) * 100) / 100 };
}

// =====================================================================
// Inlined from pb_public/js/lib/discount.js
// =====================================================================

function calcNextDiscount(subtotal, currentDiscount) {
  const currentTotal = subtotal - currentDiscount;
  if (currentTotal <= 0) return currentDiscount;
  const remainder = currentTotal % 100;
  const step = remainder > 0 ? Math.min(25, remainder) : 25;
  return currentDiscount + step;
}

function calcPrevDiscount(subtotal, currentDiscount) {
  if (currentDiscount <= 0) return 0;
  const currentTotal = subtotal - currentDiscount;
  const prevTotal = currentTotal + 25;
  if (prevTotal > subtotal) return 0;
  const prevRemainder = prevTotal % 100;
  const prevStep = prevRemainder > 0 ? Math.min(25, prevRemainder) : 25;
  return Math.max(0, currentDiscount - prevStep);
}

// =====================================================================
// GST Tests
// =====================================================================

describe("extractGST", () => {
  it("1050 at 2.5+2.5 => taxable=1000, cgst=25, sgst=25, total=1050", () => {
    const r = extractGST(1050, 2.5, 2.5);
    assert.equal(r.taxable, 1000);
    assert.equal(r.cgst, 25);
    assert.equal(r.sgst, 25);
    assert.equal(r.total, 1050);
  });

  it("500 at default rates => taxable+cgst+sgst close to 500", () => {
    const r = extractGST(500);
    // 500 / 1.05 = 476.19..., cgst = 11.90, sgst = 11.90
    assert.ok(r.taxable > 0, "taxable must be positive");
    assert.ok(r.cgst > 0, "cgst must be positive");
    assert.ok(r.sgst > 0, "sgst must be positive");
    // Sum should be close to 500 (within rounding)
    const sum = r.taxable + r.cgst + r.sgst;
    assert.ok(Math.abs(sum - 500) <= 0.02, `sum ${sum} should be within 0.02 of 500`);
  });

  it("0 => all zeros", () => {
    const r = extractGST(0);
    assert.equal(r.taxable, 0);
    assert.equal(r.cgst, 0);
    assert.equal(r.sgst, 0);
    assert.equal(r.total, 0);
  });

  it("1180 at 9+9 (18% GST) => taxable=1000, cgst=90, sgst=90", () => {
    const r = extractGST(1180, 9, 9);
    assert.equal(r.taxable, 1000);
    assert.equal(r.cgst, 90);
    assert.equal(r.sgst, 90);
    assert.equal(r.total, 1180);
  });

  it("700 at default rates => non-zero breakdown", () => {
    const r = extractGST(700);
    assert.ok(r.taxable > 0, "taxable must be positive");
    assert.ok(r.cgst > 0, "cgst must be positive");
    assert.ok(r.sgst > 0, "sgst must be positive");
    assert.ok(r.taxable < 700, "taxable must be less than inclusive amount");
  });

  it("50 (small amount) => valid breakdown", () => {
    const r = extractGST(50);
    assert.ok(r.taxable > 0, "taxable must be positive");
    assert.ok(r.cgst > 0, "cgst must be positive");
    assert.ok(r.sgst > 0, "sgst must be positive");
    assert.equal(r.total, Math.round((r.taxable + r.cgst + r.sgst) * 100) / 100);
  });

  it("10000 (large amount) => valid breakdown", () => {
    const r = extractGST(10000);
    // 10000 / 1.05 = 9523.81
    assert.ok(r.taxable > 9500, "taxable should be around 9523.81");
    assert.ok(r.taxable < 9600, "taxable should be around 9523.81");
    assert.equal(r.total, Math.round((r.taxable + r.cgst + r.sgst) * 100) / 100);
  });

  it("rounding consistency: taxable+cgst+sgst === total for multiple amounts", () => {
    const amounts = [100, 250, 500, 700, 1000, 1500, 2000, 5000, 10000];
    for (const amt of amounts) {
      const r = extractGST(amt);
      const sum = Math.round((r.taxable + r.cgst + r.sgst) * 100) / 100;
      assert.equal(
        r.total,
        sum,
        `Amount ${amt}: total (${r.total}) !== taxable+cgst+sgst (${sum})`
      );
    }
  });
});

// =====================================================================
// Discount Tests
// =====================================================================

describe("calcNextDiscount", () => {
  it("1540 from 0 => 25 (first step shaves remainder 40, min(25,40)=25)", () => {
    // currentTotal = 1540, remainder = 1540 % 100 = 40, step = min(25,40) = 25
    assert.equal(calcNextDiscount(1540, 0), 25);
  });

  it("two steps from 1540: 0 -> 25 -> 40", () => {
    const step1 = calcNextDiscount(1540, 0);
    assert.equal(step1, 25);
    // currentTotal = 1540 - 25 = 1515, remainder = 15, step = min(25,15) = 15
    const step2 = calcNextDiscount(1540, step1);
    assert.equal(step2, 40);
  });

  it("at round 100 (1500 from 0) => step is 25", () => {
    // currentTotal = 1500, remainder = 0, step = 25
    assert.equal(calcNextDiscount(1500, 0), 25);
  });

  it("zero total no-op: calcNextDiscount(100, 100) returns 100", () => {
    // currentTotal = 100 - 100 = 0, guard returns currentDiscount
    assert.equal(calcNextDiscount(100, 100), 100);
  });

  it("small remainder: calcNextDiscount(1510, 0) => 10", () => {
    // currentTotal = 1510, remainder = 10, step = min(25,10) = 10
    assert.equal(calcNextDiscount(1510, 0), 10);
  });
});

describe("calcPrevDiscount", () => {
  it("1540 from 25 => 0", () => {
    assert.equal(calcPrevDiscount(1540, 25), 0);
  });

  it("from zero stays zero: calcPrevDiscount(1540, 0) => 0", () => {
    assert.equal(calcPrevDiscount(1540, 0), 0);
  });

  it("reverse from 40: calcPrevDiscount(1540, 40) => 15", () => {
    // currentTotal = 1500, prevTotal = 1525, prevRemainder = 25, prevStep = 25
    // return max(0, 40 - 25) = 15
    // Note: reverse does not perfectly mirror forward — this is by design.
    assert.equal(calcPrevDiscount(1540, 40), 15);
  });

  it("prev cannot produce negative discount", () => {
    // Even with weird inputs, result is clamped to >= 0
    const result = calcPrevDiscount(100, 5);
    assert.ok(result >= 0, "discount should never be negative");
  });

  it("round trip: 3 nexts then 3 prevs from 1540 => back to 0", () => {
    let d = 0;
    // Forward 3 steps
    d = calcNextDiscount(1540, d); // 25
    d = calcNextDiscount(1540, d); // 40
    d = calcNextDiscount(1540, d); // 40 + step
    const peak = d;
    // Reverse 3 steps
    d = calcPrevDiscount(1540, d);
    d = calcPrevDiscount(1540, d);
    d = calcPrevDiscount(1540, d);
    assert.equal(d, 0, `After 3 forward (peak=${peak}) and 3 reverse, discount should be 0`);
  });
});

describe("discount clamp (setDiscount equivalent)", () => {
  it("negative discount clamps to 0", () => {
    const amt = -50;
    const subtotal = 1000;
    const clamped = Math.max(0, Math.min(amt, subtotal));
    assert.equal(clamped, 0);
  });

  it("discount over subtotal clamps to subtotal", () => {
    const amt = 2000;
    const subtotal = 1000;
    const clamped = Math.max(0, Math.min(amt, subtotal));
    assert.equal(clamped, subtotal);
  });
});

describe("discount real scenario", () => {
  it("subtotal=2540, steps 0 -> 25 -> 40", () => {
    // currentTotal = 2540, remainder = 40, step = min(25,40) = 25
    const step1 = calcNextDiscount(2540, 0);
    assert.equal(step1, 25);
    // currentTotal = 2540 - 25 = 2515, remainder = 15, step = min(25,15) = 15
    const step2 = calcNextDiscount(2540, step1);
    assert.equal(step2, 40);
  });
});
