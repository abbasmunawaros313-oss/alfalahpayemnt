import axios from "axios";
import CryptoJS from "crypto-js";
import 'dotenv/config';
// 🔹 CONFIG FROM ENVIRONMENT VARIABLES
const BASE = process.env.ALFA_BASE_URL;
const KEY1 = process.env.ALFA_KEY1;
const KEY2 = process.env.ALFA_KEY2;

const CONFIG = {
  ChannelId: process.env.ALFA_CHANNEL_ID,
  MerchantId: process.env.ALFA_MERCHANT_ID,
  StoreId: process.env.ALFA_STORE_ID,
  MerchantHash: process.env.ALFA_MERCHANT_HASH,
  MerchantUsername: process.env.ALFA_USERNAME,
  MerchantPassword: process.env.ALFA_PASSWORD,
  ReturnURL: process.env.ALFA_RETURN_URL,
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

// 🤝 HANDSHAKE (STEP 1)
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
    HS_IsRedirectionRequest: "0", 
  };

  payload.HS_RequestHash = generateRequestHash(payload);

  const formData = new URLSearchParams();
  Object.keys(payload).forEach(key => formData.append(key, payload[key]));

  try {
    const { data } = await axios.post(`${BASE}/HS/HS/HS`, formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return data;
  } catch (error) {
    console.error("❌ HANDSHAKE ERROR:", error.response?.data || error.message);
    throw error;
  }
};

// 💳 SSO REDIRECT FORM (STEP 2)
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
    TransactionTypeId: transactionTypeId,
    TransactionReferenceNumber: orderId,
    TransactionAmount: amount,
  };

  payload.RequestHash = generateRequestHash(payload);

  return {
    action: `${BASE}/SSO/SSO/SSO`,
    fields: payload,
  };
};

// 📊 IPN - CHECK TRANSACTION STATUS
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