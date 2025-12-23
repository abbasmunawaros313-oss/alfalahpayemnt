import express from "express";
import { handshake, generateSSOForm, checkTransactionStatus } from "../utils/services/alfa.service.js";

const router = express.Router();

/* =====================================================
   CREATE PAYMENT (ALL METHODS USE REDIRECT)
===================================================== */
router.post("/create-payment", async (req, res) => {
  try {
    const { amount, type } = req.body;

    if (!amount || !type) {
      return res.status(200).json({
        success: false,
        message: "Missing amount or payment type"
      });
    }

    const orderId = `ORD-${Date.now()}`;
    console.log("🧾 NEW ORDER INITIATED:", orderId, "TYPE:", type);

    /* STEP 1: Handshake */
    const authRaw = await handshake(orderId);
    console.log("📝 HANDSHAKE RAW RESPONSE:", authRaw);
    const auth = typeof authRaw === "string" ? JSON.parse(authRaw) : authRaw;

    if (!auth?.AuthToken) {
      throw new Error("Handshake failed: " + (auth?.ErrorMessage || "No AuthToken received"));
    }

    /* STEP 2: Generate SSO redirect form */
    const formData = generateSSOForm(
      auth.AuthToken,
      orderId,
      String(amount),
      type // 1=Wallet, 2=Bank Account, 3=Card
    );

    return res.status(200).json({
      success: true,
      orderId,
      paymentType: type === "1" ? "wallet" : type === "2" ? "bank" : "card",
      redirectForm: formData
    });

  } catch (err) {
    console.error("❌ CREATE PAYMENT ERROR:", err.message);

    return res.status(200).json({
      success: false,
      message: err.message || "Payment initiation failed"
    });
  }
});

/* =====================================================
   CHECK PAYMENT STATUS (IPN Query)
   Called after customer returns from bank page
===================================================== */
router.post("/check-payment-status", async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(200).json({
        success: false,
        message: "Order ID missing"
      });
    }

    console.log("🔍 CHECKING PAYMENT STATUS:", orderId);

    // Query IPN
    const status = await checkTransactionStatus(orderId);

    console.log("🏦 IPN RESPONSE:", status);

    // Check if paid
    const isPaid =
      status?.ResponseCode === "00" &&
      status?.TransactionStatus?.toLowerCase() === "paid";

    return res.status(200).json({
      success: isPaid,
      message: isPaid ? "Transaction Successful" : (status?.Description || "Transaction Failed"),
      transactionStatus: status
    });

  } catch (err) {
    console.error("❌ CHECK STATUS ERROR:", err.message);

    return res.status(200).json({
      success: false,
      message: "Failed to check payment status"
    });
  }
});

/* =====================================================
   RETURN URL HANDLER (Optional)
   Handle customer redirect from bank
===================================================== */
router.get("/payment-return", async (req, res) => {
  const { O: orderId, TS, RC, RD } = req.query;
  
  console.log("🔄 CUSTOMER RETURNED:", { orderId, TS, RC, RD });

  // You can check status here and redirect customer to success/failure page
  if (orderId) {
    try {
      const status = await checkTransactionStatus(orderId);
      const isPaid = status?.TransactionStatus?.toLowerCase() === "paid";
      
      // Redirect to your frontend
      return res.redirect(`https://ostravel.pk/payment-result?orderId=${orderId}&status=${isPaid ? 'success' : 'failed'}`);
    } catch (err) {
      console.error("Return URL error:", err);
      return res.redirect(`https://ostravel.pk/payment-result?error=true`);
    }
  }

  return res.redirect("https://ostravel.pk");
});

export default router;