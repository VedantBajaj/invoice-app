import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Discount logic: max(amount - 25, floor(amount/100)*100)
// Returns the FINAL price after discount (higher = less discount)
function applyDiscount(amount) {
  const option1 = amount - 25;
  const option2 = Math.floor(amount / 100) * 100;
  return Math.max(option1, option2);
}

describe("Discount Logic", () => {
  it("1540 -> 1515 (takes 25 off, because 1515 > 1500)", () => {
    assert.equal(applyDiscount(1540), 1515);
  });

  it("1515 -> 1500 (rounds down, because 1500 > 1490)", () => {
    assert.equal(applyDiscount(1515), 1500);
  });

  it("1500 -> 1500 (exact multiple of 100, no discount: floor(1500/100)*100 = 1500)", () => {
    assert.equal(applyDiscount(1500), 1500);
  });

  it("1475 -> 1450 (takes 25 off, because 1450 > 1400)", () => {
    assert.equal(applyDiscount(1475), 1450);
  });

  it("1450 -> 1425 (takes 25 off, because 1425 > 1400)", () => {
    assert.equal(applyDiscount(1450), 1425);
  });

  it("1425 -> 1400 (both equal: 1400 = 1400)", () => {
    assert.equal(applyDiscount(1425), 1400);
  });

  it("100 -> 100 (exact multiple of 100, no discount: floor(100/100)*100 = 100)", () => {
    assert.equal(applyDiscount(100), 100);
  });

  it("99 -> 74 (takes 25 off, 74 > 0)", () => {
    assert.equal(applyDiscount(99), 74);
  });

  it("25 -> 0 (takes 25 off, 0 = 0)", () => {
    assert.equal(applyDiscount(25), 0);
  });

  it("24 -> 0 (rounds down to 0, because 0 > -1)", () => {
    assert.equal(applyDiscount(24), 0);
  });

  it("0 -> 0 (both options give negative or zero, max is 0)", () => {
    assert.equal(applyDiscount(0), 0);
  });

  it("200 -> 200 (rounds to 200, because 200 > 175)", () => {
    assert.equal(applyDiscount(200), 200);
  });

  it("225 -> 200 (both equal: 200 = 200)", () => {
    assert.equal(applyDiscount(225), 200);
  });

  it("250 -> 225 (takes 25 off, 225 > 200)", () => {
    assert.equal(applyDiscount(250), 225);
  });
});
