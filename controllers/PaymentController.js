const QRCode = require("qrcode");

// NETQR payment generation
const generateNetQR = async (req, res) => {
  const totalAmount = parseFloat(req.body.total); // convert to number
  const orderId = req.body.orderId;

  // Simulated NETQR payment URL (replace with actual sandbox URL if available)
  const paymentUrl = `https://netqr.example.com/pay?amount=${totalAmount}&orderId=${orderId}`;

  try {
    // Generate QR code as Base64 image
    const qrImage = await QRCode.toDataURL(paymentUrl);

    // Render payment page and pass variables to EJS
    res.render("payment", {
      qrImage,
      totalAmount,
      orderId
    });
  } catch (err) {
    console.error("Error generating QR code:", err);
    res.send("Error generating QR code");
  }
};

module.exports = { generateNetQR };
