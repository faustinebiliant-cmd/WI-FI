// ============================================================
// Oswagolink - Input Validators
// ============================================================

const isValidEmail = (email) => {
  if (typeof email !== 'string') return false;
  if (email.length > 255) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const isValidPhone = (phone) => {
  if (typeof phone !== 'string') return false;
  if (phone.length > 20) return false;
  // Allows 0712345678, +255712345678, 255712345678
  const phoneRegex = /^(\+?255|0)[0-9]{9}$/;
  return phoneRegex.test(phone.replace(/[\s-]/g, ''));
};

const isValidMACAddress = (mac) => {
  if (typeof mac !== 'string') return false;
  // Matches 00:1A:2B:3C:4D:5E (case insensitive)
  const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
  return macRegex.test(mac);
};

const isValidIPAddress = (ip) => {
  if (typeof ip !== 'string') return false;
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipRegex.test(ip)) return false;
  // Ensure octets are <= 255
  return ip.split('.').every(octet => parseInt(octet, 10) <= 255);
};

// Voucher codes: 8 characters without look-alikes (no 0/O, no 1/I/L), e.g. K7MP4RQX.
// 31^8 = about 850 billion codes, so guessing one is hopeless.
const VOUCHER_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const VOUCHER_CODE_LENGTH = 8;
const VOUCHER_CODE_RE = /^[2-9A-HJKMNP-Z]{8}$/;

const isValidVoucherCode = (code) => typeof code === 'string' && VOUCHER_CODE_RE.test(code);

// Router tokens (portal links and setup links): letters, digits, - and _
const isValidRouterToken = (token) =>
  typeof token === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(token);

const isValidUUID = (uuid) => {
  if (typeof uuid !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

// Rejects names with HTML or script in them (a simple filter for names and labels).
// SQL injection is prevented elsewhere: every query passes values as $1, $2, ...
const isSafeText = (text) => {
  if (!text) return true;
  if (typeof text !== 'string') return false;
  if (text.length > 255) return false;

  // Reject HTML tags or script injections
  const dangerousPatterns = [
    /<\s*script/i,
    /<\s*img/i,
    /javascript:/i,
    /onerror=/i,
    /onload=/i
  ];

  return !dangerousPatterns.some(pattern => pattern.test(text));
};

module.exports = {
  isValidEmail,
  isValidPhone,
  isValidMACAddress,
  isValidIPAddress,
  isValidVoucherCode,
  VOUCHER_CODE_ALPHABET,
  VOUCHER_CODE_LENGTH,
  isValidUUID,
  isValidRouterToken,
  isSafeText
};