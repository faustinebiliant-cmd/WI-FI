// ============================================================
// OSWAGOTech WiFi - Encryption Service
// Used to encrypt MikroTik API passwords before saving to DB
// ============================================================
const crypto = require('crypto');

// We need a 32-byte key for AES-256. 
// We will read it from env, or fallback for dev if missing.
const ENCRYPTION_KEY = process.env.ROUTER_ENCRYPTION_KEY || '12345678901234567890123456789012'; 
const ALGORITHM = 'aes-256-gcm';

const encrypt = (text) => {
  if (!text) return null;
  
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag().toString('hex');
  
  // Format: iv:authTag:encryptedText
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
};

const decrypt = (hash) => {
  if (!hash) return null;
  
  try {
    const [ivHex, authTagHex, encryptedText] = hash.split(':');
    if (!ivHex || !authTagHex || !encryptedText) return null;

    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error.message);
    return null;
  }
};

module.exports = { encrypt, decrypt };