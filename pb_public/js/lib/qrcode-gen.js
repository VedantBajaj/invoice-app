/**
 * UPI QR Code Generator
 * Uses QRCode.js to generate UPI payment QR codes with amount
 */
function generateUpiQR(elementId, amount) {
  const upiId = Alpine.store("settings").get("upi_id");
  const shopName = Alpine.store("settings").get("shop_name", "Store");

  if (!upiId || upiId === "-") {
    console.warn("UPI ID not configured");
    return null;
  }

  const el = document.getElementById(elementId);
  if (!el) return null;

  // Clear previous QR
  el.innerHTML = "";

  // Build UPI deep link
  const params = new URLSearchParams({
    pa: upiId,
    pn: shopName,
    cu: "INR",
  });
  if (amount && amount > 0) {
    params.set("am", amount.toFixed(2));
  }
  const upiUrl = "upi://pay?" + params.toString();

  // Generate QR code
  const qr = new QRCode(el, {
    text: upiUrl,
    width: 200,
    height: 200,
    colorDark: "#000000",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.M,
  });

  return upiUrl;
}

window.generateUpiQR = generateUpiQR;
