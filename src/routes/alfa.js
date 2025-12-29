import express from "express";
import { encryptAES, decryptAES } from "../utils/aes.js";

const router = express.Router();

// Bank Alfalah configuration
const config = {
  merchantId: process.env.ALFA_MERCHANT_ID,
  storeId: process.env.ALFA_STORE_ID,
  merchantHash: process.env.ALFA_MERCHANT_HASH,
  merchantUsername: process.env.ALFA_MERCHANT_USERNAME,
  merchantPassword: process.env.ALFA_MERCHANT_PASSWORD,
  channelId: process.env.ALFA_CHANNEL_ID,
  currency: process.env.ALFA_CURRENCY,
  returnUrl: process.env.ALFA_RETURN_URL,
  listenerUrl: process.env.ALFA_LISTENER_URL,
  paymentUrl: process.env.ALFA_PAYMENT_URL,
  key1: process.env.ALFA_KEY1,
  key2: process.env.ALFA_KEY2,
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
};

// Validate critical config values
console.log("🔧 Bank Alfalah Config Loaded:");
console.log(" - Channel ID:", config.channelId);
console.log(" - Currency:", config.currency);
console.log(" - Key1:", config.key1 ? `✓ Set (${config.key1.length} chars)` : "✗ Missing");
console.log(" - Key2:", config.key2 ? `✓ Set (${config.key2.length} chars)` : "✗ Missing");
console.log(" - Return URL:", config.returnUrl);
console.log(" - Listener URL:", config.listenerUrl);
console.log(" - Payment URL:", config.paymentUrl);
console.log(" - Frontend URL:", config.frontendUrl);

// Validate required environment variables
const requiredVars = [
  "channelId",
  "currency",
  "key1",
  "key2",
  "merchantId",
  "storeId",
  "returnUrl",
  "listenerUrl",
];
const missingVars = requiredVars.filter((key) => !config[key]);

if (missingVars.length > 0) {
  console.error("❌ CRITICAL: Missing environment variables:", missingVars);
  console.error("   Please check your .env file!");
}

// Validate key lengths
if (config.key1 && config.key1.length < 16) {
  console.error("❌ ALFA_KEY1 must be at least 16 characters");
}
if (config.key2 && config.key2.length < 16) {
  console.error("❌ ALFA_KEY2 must be at least 16 characters");
}

// In-memory transaction cache (no database needed)
const transactionCache = new Map();
console.log("💾 Transaction cache initialized");

/**
 * POST /api/alfa/pay
 * Main payment endpoint
 */
router.post("/pay", async (req, res) => {
  try {
    const {
      transactionId,
      amount,
      transactionType,
      isRedirectionRequest,
      customerEmail,
      customerName,
      customerMobile,
    } = req.body;

    console.log("💳 Payment Request:", {
      transactionId,
      amount,
      customerEmail,
    });

    // Validation
    if (!transactionId || !amount) {
      console.error("❌ Validation failed: Missing transactionId or amount");
      return res.status(400).json({
        success: false,
        message: "Missing required fields: transactionId and amount",
      });
    }

    // Validate amount is positive
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      console.error("❌ Invalid amount:", amount);
      return res.status(400).json({
        success: false,
        message: "Invalid amount",
      });
    }

    // 1. FORMAT
    const formattedAmount = numAmount.toFixed(2);
    const description = "Order Payment";

    // 2. ENCRYPTION (8-Parameters)
    const transactionData = [
      config.channelId,
      config.currency,
      formattedAmount,
      transactionId,
      description,
      customerEmail || "",
      customerMobile || "",
      config.returnUrl,
    ].join("|");

    console.log("📦 Transaction Data to Encrypt:", transactionData);

    let encryptedRequest;
    try {
      encryptedRequest = encryptAES(
        transactionData,
        config.key1,
        config.key2
      );
      console.log("🔐 Encrypted Request Hash:", encryptedRequest.substring(0, 50) + "...");
    } catch (encryptError) {
      console.error("❌ Encryption failed:", encryptError.message);
      return res.status(500).json({
        success: false,
        message: "Encryption failed. Please check your encryption keys.",
        error: encryptError.message,
      });
    }

    // 3. FORM DATA
    const paymentFields = {
      HS_ChannelId: config.channelId,
      HS_MerchantId: config.merchantId,
      HS_StoreId: config.storeId,
      HS_MerchantHash: config.merchantHash,
      HS_MerchantUsername: config.merchantUsername,
      HS_MerchantPassword: config.merchantPassword,
      HS_TransactionReferenceNumber: transactionId,
      HS_TransactionAmount: formattedAmount,
      HS_TransactionDescription: description,
      HS_RequestHash: encryptedRequest,
      HS_IsRedirectionRequest: isRedirectionRequest || "1",
      HS_ReturnURL: config.returnUrl,
      HS_ListenerURL: config.listenerUrl,
      HS_TransactionTypeId: transactionType || "3",
    };

    console.log("✅ Payment initiated successfully for:", transactionId);

    // Cache transaction data for later retrieval
    transactionCache.set(transactionId, {
      transactionId,
      amount: formattedAmount,
      customerEmail: customerEmail || "",
      customerName: customerName || "",
      customerMobile: customerMobile || "",
      status: "pending",
      createdAt: new Date().toISOString(),
      policyData: null,
    });
    console.log("💾 Cached transaction:", transactionId);

    res.json({
      success: true,
      data: {
        paymentUrl: config.paymentUrl,
        paymentFields: paymentFields,
      },
      message: "Payment initiated successfully",
    });
  } catch (error) {
    console.error("❌ Payment error:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

/**
 * POST /api/alfa/listener
 * Webhook for backend server notifications
 */
router.post("/listener", async (req, res) => {
  try {
    console.log("🔔 Payment Listener Called:", {
      timestamp: new Date().toISOString(),
      body: req.body,
      headers: {
        "content-type": req.headers["content-type"],
        "user-agent": req.headers["user-agent"],
      },
    });

    const {
      RequestHash,
      ResponseCode,
      ResponseMessage,
      HS_TransactionReferenceNumber,
    } = req.body;

    if (!RequestHash) {
      console.warn("⚠️ Listener called without RequestHash");
      return res.status(200).json({ message: "Received" });
    }

    try {
      const decryptedData = decryptAES(RequestHash, config.key1, config.key2);
      console.log("🔓 Decrypted Response:", decryptedData);

      // Parse decrypted data (format: field1|field2|field3...)
      const fields = decryptedData.split("|");
      console.log("📊 Parsed Fields:", fields);

      if (ResponseCode === "00" || ResponseCode === "000") {
        console.log("✅ Payment Successful:", {
          transactionRef: HS_TransactionReferenceNumber,
          responseCode: ResponseCode,
        });

        // Update cache with success status
        const cached = transactionCache.get(HS_TransactionReferenceNumber);
        if (cached) {
          cached.status = "success";
          cached.responseCode = ResponseCode;
          cached.responseMessage = ResponseMessage;
          cached.paidAt = new Date().toISOString();
          cached.decryptedData = decryptedData;
          transactionCache.set(HS_TransactionReferenceNumber, cached);
          console.log("💾 Updated cache: success");
        }
      } else {
        console.log("❌ Payment Failed:", {
          transactionRef: HS_TransactionReferenceNumber,
          responseCode: ResponseCode,
          message: ResponseMessage,
        });

        // Update cache with failure status
        const cached = transactionCache.get(HS_TransactionReferenceNumber);
        if (cached) {
          cached.status = "failed";
          cached.responseCode = ResponseCode;
          cached.responseMessage = ResponseMessage;
          cached.failedAt = new Date().toISOString();
          transactionCache.set(HS_TransactionReferenceNumber, cached);
          console.log("💾 Updated cache: failed");
        }
      }
    } catch (decryptError) {
      console.error("❌ Decryption error in listener:", decryptError);
    }

    res.status(200).json({ message: "Received" });
  } catch (error) {
    console.error("❌ Listener error:", error);
    res.status(200).json({ message: "Received" });
  }
});

/**
 * Helper function to process payment return data
 */
function processReturnData(data) {
  console.log("🔍 Processing return data:", data);

  // Handle both GET and POST parameters
  const params = {
    success: data.success || data.Success,
    authToken: data.AuthToken || data.authToken || data.auth_token,
    transactionId: data.transaction_id || data.TransactionId || data.HS_TransactionReferenceNumber,
    errorMessage: data.ErrorMessage || data.errorMessage || data.error_message,
    responseCode: data.ResponseCode || data.response_code,
    responseMessage: data.ResponseMessage || data.response_message,
    requestHash: data.RequestHash || data.request_hash,
  };

  console.log("📋 Normalized params:", params);

  // Determine success status
  let isSuccess = false;
  if (params.success === 'true' || params.success === true) {
    isSuccess = true;
  } else if (params.responseCode === '00' || params.responseCode === '000') {
    isSuccess = true;
  }

  return {
    isSuccess,
    params,
  };
}

/**
 * GET/POST /api/alfa/return
 * Handles the User Redirect back to the website (supports both methods)
 */
router.all("/return", (req, res) => {
  console.log("🔙 Payment Return Received:", {
    timestamp: new Date().toISOString(),
    method: req.method,
    query: req.query,
    body: req.body,
    fullUrl: req.originalUrl,
  });

  // Combine query params and body
  const allData = { ...req.query, ...req.body };
  const { isSuccess, params } = processReturnData(allData);

  // Try to decrypt if RequestHash is present
  let decryptedData = null;
  if (params.requestHash) {
    try {
      decryptedData = decryptAES(params.requestHash, config.key1, config.key2);
      console.log("🔓 Decrypted Return Data:", decryptedData);

      // Parse transaction ID from decrypted data if not in params
      if (!params.transactionId && decryptedData) {
        const fields = decryptedData.split("|");
        if (fields.length >= 4) {
          params.transactionId = fields[3]; // Transaction ID is usually 4th field
          console.log("📦 Extracted Transaction ID from hash:", params.transactionId);
        }
      }
    } catch (decryptError) {
      console.error("❌ Failed to decrypt return data:", decryptError);
    }
  }

  // Update cache if we have a transaction ID
  if (params.transactionId) {
    const cached = transactionCache.get(params.transactionId);
    if (cached) {
      cached.status = isSuccess ? "success" : "failed";
      cached.responseCode = params.responseCode;
      cached.responseMessage = params.responseMessage || params.errorMessage;
      cached.authToken = params.authToken;
      cached.returnedAt = new Date().toISOString();
      if (decryptedData) cached.decryptedData = decryptedData;
      transactionCache.set(params.transactionId, cached);
      console.log("💾 Updated cache on return:", cached.status);
    } else {
      console.warn("⚠️ Transaction not found in cache:", params.transactionId);
    }
  }

  // Build redirect URL
  const baseUrl = config.frontendUrl;
  let redirectUrl;

  if (isSuccess) {
    console.log("✅ Redirecting to success page");
    redirectUrl = `${baseUrl}/payment-return?status=success&O=${params.transactionId || ""}&token=${params.authToken || ""}`;
  } else {
    console.log("❌ Redirecting to failure page");
    const errorMsg = params.errorMessage || params.responseMessage || "Payment failed";
    redirectUrl = `${baseUrl}/payment-return?status=failed&O=${params.transactionId || ""}&msg=${encodeURIComponent(errorMsg)}`;
  }

  console.log("🔗 Redirecting to:", redirectUrl);
  res.redirect(redirectUrl);
});

/**
 * POST /api/alfa/check-payment-status
 * Check payment status from cache
 */
router.post("/check-payment-status", (req, res) => {
  try {
    const { orderId } = req.body;

    console.log("🔍 Checking payment status for:", orderId);

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required"
      });
    }

    const cached = transactionCache.get(orderId);

    if (!cached) {
      console.warn("⚠️ Transaction not found in cache:", orderId);
      return res.status(404).json({
        success: false,
        message: "Transaction not found. It may have expired."
      });
    }

    console.log("✅ Transaction found:", cached.status);

    res.json({
      success: true,
      transactionStatus: {
        TransactionId: cached.transactionId,
        TransactionReferenceNumber: cached.transactionId,
        TransactionAmount: cached.amount,
        TransactionDateTime: cached.paidAt || cached.createdAt,
        Status: cached.status.toUpperCase(),
        ResponseCode: cached.responseCode,
        ResponseMessage: cached.responseMessage,
        CustomerEmail: cached.customerEmail,
        CustomerName: cached.customerName,
        CustomerMobile: cached.customerMobile,
        AuthToken: cached.authToken,
      },
      message: "Payment status retrieved successfully"
    });

  } catch (error) {
    console.error("❌ Check status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check payment status"
    });
  }
});

/**
 * GET /api/alfa/test
 * Health check endpoint
 */
router.get("/test", (req, res) => {
  const status = {
    success: true,
    message: "Bank Alfalah API Running",
    config: {
      channelId: config.channelId ? "✓" : "✗",
      merchantId: config.merchantId ? "✓" : "✗",
      key1: config.key1 && config.key1.length >= 16 ? "✓" : "✗",
      key2: config.key2 && config.key2.length >= 16 ? "✓" : "✗",
      returnUrl: config.returnUrl ? "✓" : "✗",
      listenerUrl: config.listenerUrl ? "✓" : "✗",
      frontendUrl: config.frontendUrl ? "✓" : "✗",
      paymentUrl: config.paymentUrl ? "✓" : "✗",
    },
    cacheSize: transactionCache.size,
    timestamp: new Date().toISOString(),
  };

  console.log("🏥 Health check:", status);
  res.json(status);
});

/**
 * GET /api/alfa/cache/:transactionId (DEBUG ONLY)
 * View cached transaction data
 */
router.get("/cache/:transactionId", (req, res) => {
  const { transactionId } = req.params;
  const cached = transactionCache.get(transactionId);

  if (cached) {
    res.json({ success: true, data: cached });
  } else {
    res.status(404).json({ success: false, message: "Transaction not found in cache" });
  }
});

export default router;
