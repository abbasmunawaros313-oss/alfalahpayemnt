import axios from "axios";
import CryptoJS from "crypto-js";

// 🔹 BASE URL (PRODUCTION)
const BASE = "https://payments.bankalfalah.com";

// 🔹 AES KEYS (PRODUCTION)
const KEY1 = "N3uCaM8fW63EyBfb";
const KEY2 = "1758551299086953";

// 🔹 STATIC MERCHANT CONFIG (PRODUCTION)
const CONFIG = {
  ChannelId: "1001", // Page redirection = 1001
  MerchantId: "223804",
  StoreId: "437452",
  MerchantHash: "OUU362MB1uqehKjhFzQ2oxUP0D57r63DAus8b/e3z0woVC91w3XnpdCU9TE7Mlzn",
  MerchantUsername: "denexa",
  MerchantPassword: "IESH3hA0fv1vFzk4yqF7CA==",
  ReturnURL: "https://ostravel.pk/bookingconfirmation",
};

// 🔹 FUNCTION TO GENERATE AES HASH
export function generateRequestHash(payload) {
  const mapString = Object.keys(payload)
    .map(key => `${key}=${payload[key]}`)
    .join("&");

  const encrypted = CryptoJS.AES.encrypt(
    CryptoJS.enc.Utf8.parse(mapString),
    CryptoJS.enc.Utf8.parse(KEY1),
    {
      keySize: 128 / 8,
      iv: CryptoJS.enc.Utf8.parse(KEY2),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    }
  );

  return encrypted.toString();
}

/* =========================
   🤝 HANDSHAKE (STEP 1)
   For backend API calls - returns JSON
========================= */
export const handshake = async (orderId) => {
  const payload = {
    HS_ChannelId: CONFIG.ChannelId,
    HS_MerchantId: CONFIG.MerchantId,
    HS_StoreId: CONFIG.StoreId,
    HS_ReturnURL: CONFIG.ReturnURL,
    HS_MerchantHash: CONFIG.MerchantHash,
    HS_MerchantUsername: CONFIG.MerchantUsername,
    HS_MerchantPassword: CONFIG.MerchantPassword,
    HS_TransactionReferenceNumber: orderId,
    HS_IsRedirectionRequest: "0", // 0 = API returns JSON, 1 = Browser redirect
  };

  payload.HS_RequestHash = generateRequestHash(payload);

  // Convert to URLSearchParams for form-urlencoded
  const formData = new URLSearchParams();
  Object.keys(payload).forEach(key => {
    formData.append(key, payload[key]);
  });

  try {
    const { data } = await axios.post(`${BASE}/HS/HS/HS`, formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    console.log("✅ HANDSHAKE SUCCESS:", data);
    return data;
  } catch (error) {
    console.error("❌ HANDSHAKE ERROR:", error.response?.data || error.message);
    throw error;
  }
};

/* =========================
   💳 SSO REDIRECT FORM (STEP 2)
   For ALL payment methods
========================= */
export const generateSSOForm = (authToken, orderId, amount, transactionTypeId) => {
  const payload = {
    AuthToken: authToken,
    RequestHash: "",
    ChannelId: CONFIG.ChannelId,
    Currency: "PKR",
    IsBIN: "0",
    ReturnURL: CONFIG.ReturnURL,
    MerchantId: CONFIG.MerchantId,
    StoreId: CONFIG.StoreId,
    MerchantHash: CONFIG.MerchantHash,
    MerchantUsername: CONFIG.MerchantUsername,
    MerchantPassword: CONFIG.MerchantPassword,
    TransactionTypeId: transactionTypeId, // 1=Wallet, 2=Bank Account, 3=Card
    TransactionReferenceNumber: orderId,
    TransactionAmount: amount,
  };

  payload.RequestHash = generateRequestHash(payload);

  return {
    action: `${BASE}/SSO/SSO/SSO`,
    fields: payload,
  };
};

/* =========================
   📊 IPN - CHECK TRANSACTION STATUS
   Query after redirect back
========================= */
export const checkTransactionStatus = async (orderId) => {
  const url = `${BASE}/HS/api/IPN/OrderStatus/${CONFIG.MerchantId}/${CONFIG.StoreId}/${orderId}`;
  
  try {
    const { data } = await axios.get(url);
    return data;
  } catch (error) {
    console.error("IPN Query Error:", error.message);
    throw error;
  }
};

