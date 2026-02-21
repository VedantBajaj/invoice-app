/**
 * Discount step logic:
 * Each press of + gives min(25, currentTotal - nearestLower100)
 * If already at a round 100, gives 25.
 */
function calcNextDiscount(subtotal, currentDiscount) {
  const currentTotal = subtotal - currentDiscount;
  if (currentTotal <= 0) return currentDiscount;
  const remainder = currentTotal % 100;
  const step = remainder > 0 ? Math.min(25, remainder) : 25;
  return currentDiscount + step;
}

/**
 * Reverse a discount step (- button)
 * Goes back up by finding what the previous total's step would have been
 */
function calcPrevDiscount(subtotal, currentDiscount) {
  if (currentDiscount <= 0) return 0;
  const currentTotal = subtotal - currentDiscount;
  // Figure out what step got us here
  const prevTotal = currentTotal + 25;
  if (prevTotal > subtotal) return 0;
  const prevRemainder = prevTotal % 100;
  const prevStep = prevRemainder > 0 ? Math.min(25, prevRemainder) : 25;
  return Math.max(0, currentDiscount - prevStep);
}

window.calcNextDiscount = calcNextDiscount;
window.calcPrevDiscount = calcPrevDiscount;
