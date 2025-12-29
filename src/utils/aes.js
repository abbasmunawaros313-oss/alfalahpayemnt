import crypto from "crypto";

/**
 * Prepares key/IV to be exactly 16 bytes for AES-128-CBC
 * @param {string} key - The key string
 * @returns {Buffer} 16-byte buffer
 */
function prepareKey(key) {
  const buffer = Buffer.from(key, "utf8");
  
  if (buffer.length < 16) {
    throw new Error(`Key must be at least 16 characters, got ${buffer.length}`);
  }
  
  // Take first 16 bytes if longer
  return buffer.slice(0, 16);
}

/**
 * Encrypt data using AES-128-CBC
 * @param {string} data - Data to encrypt
 * @param {string} key1 - First key (min 16 bytes)
 * @param {string} key2 - Second key/IV (min 16 bytes)
 * @returns {string} Base64 encoded encrypted data
 */
export function encryptAES(data, key1, key2) {
  try {
    if (!data || !key1 || !key2) {
      throw new Error("Missing required parameters: data, key1, or key2");
    }

    const key = prepareKey(key1);
    const iv = prepareKey(key2);

    console.log("🔐 Encrypting with:", {
      dataLength: data.length,
      keyLength: key.length,
      ivLength: iv.length,
      dataPreview: data.substring(0, 50) + "..."
    });

    const cipher = crypto.createCipheriv("aes-128-cbc", key, iv);
    let encrypted = cipher.update(data, "utf8", "base64");
    encrypted += cipher.final("base64");

    console.log("✅ Encryption successful, output length:", encrypted.length);
    return encrypted;
  } catch (error) {
    console.error("❌ Encryption error:", error.message);
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

/**
 * Decrypt data using AES-128-CBC
 * @param {string} encryptedData - Base64 encoded encrypted data
 * @param {string} key1 - First key (min 16 bytes)
 * @param {string} key2 - Second key/IV (min 16 bytes)
 * @returns {string} Decrypted data
 */
export function decryptAES(encryptedData, key1, key2) {
  try {
    if (!encryptedData || !key1 || !key2) {
      throw new Error("Missing required parameters: encryptedData, key1, or key2");
    }

    const key = prepareKey(key1);
    const iv = prepareKey(key2);

    console.log("🔓 Decrypting with:", {
      encryptedLength: encryptedData.length,
      keyLength: key.length,
      ivLength: iv.length,
    });

    const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
    let decrypted = decipher.update(encryptedData, "base64", "utf8");
    decrypted += decipher.final("utf8");

    console.log("✅ Decryption successful, output length:", decrypted.length);
    return decrypted;
  } catch (error) {
    console.error("❌ Decryption error:", error.message);
    console.error("   This usually means:");
    console.error("   1. Wrong encryption keys");
    console.error("   2. Data was tampered with");
    console.error("   3. Data is not properly base64 encoded");
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

/**
 * Test encryption/decryption with your keys
 * @param {string} key1 - First key
 * @param {string} key2 - Second key
 * @returns {boolean} True if test passes
 */
export function testEncryption(key1, key2) {
  try {
    const testData = "Test|Data|123|456.78";
    console.log("🧪 Testing encryption with test data:", testData);
    
    const encrypted = encryptAES(testData, key1, key2);
    console.log("   Encrypted:", encrypted);
    
    const decrypted = decryptAES(encrypted, key1, key2);
    console.log("   Decrypted:", decrypted);
    
    if (testData === decrypted) {
      console.log("✅ Encryption test PASSED");
      return true;
    } else {
      console.log("❌ Encryption test FAILED");
      console.log("   Expected:", testData);
      console.log("   Got:", decrypted);
      return false;
    }
  } catch (error) {
    console.error("❌ Encryption test ERROR:", error.message);
    return false;
  }
}
