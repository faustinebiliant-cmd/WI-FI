// ============================================================
// Oswagolink - Input Validators
// ============================================================

// Every password (login, new password, admin account) is at most 50 characters
const MAX_PASSWORD_LENGTH = 50;

// An ordinary email address: letters, numbers and . _ % + - before the @, a real domain after it
const MAX_EMAIL_LENGTH = 50;
const isValidEmail = (email) => {
  if (typeof email !== 'string') return false;
  if (email.length > MAX_EMAIL_LENGTH) return false;
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(email);
};

// Allows 0712345678, +255712345678, 255712345678 (spaces and dashes are ignored)
const cleanPhone = (phone) => String(phone).replace(/[\s-]/g, '');
const isValidPhone = (phone) => {
  if (typeof phone !== 'string') return false;
  if (phone.length > 20) return false;
  return /^(\+?255|0)[0-9]{9}$/.test(cleanPhone(phone));
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

// Names (business, owner, package, router, location): ONLY letters, numbers, spaces
// and . , - ' & ( ). Everything else is refused: HTML, symbols, emoji, invisible and
// right-to-left characters, and the zero character the database cannot store.
// (SQL injection is prevented elsewhere: every query passes values as $1, $2, ...)
const NAME_CHARS_RE = /^[A-Za-z0-9 .,'&()-]+$/;
const NAME_RULE_TEXT = "letters, numbers, spaces and . , - ' & ( ) only";

// The text is checked as it will be saved (spaces at both ends removed)
const isValidName = (text, minLength, maxLength) => {
  if (typeof text !== 'string') return false;
  const value = text.trim();
  return value.length >= minLength && value.length <= maxLength && (value.length === 0 || NAME_CHARS_RE.test(value));
};

// The message for a refused name, e.g. "Package name: 1 to 40 characters, letters, ..."
const nameRuleMessage = (label, minLength, maxLength) =>
  `${label}: ${minLength} to ${maxLength} characters, ${NAME_RULE_TEXT}.`;

// Whole numbers only, between min and max: a number, or digits as text
// (accepts 500 or "500"; refuses 5.5, "5abc", "-1", "", true, [5])
const isWholeNumberBetween = (value, min, max) => {
  let n;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && /^[0-9]{1,9}$/.test(value.trim())) n = Number(value.trim());
  else return false;
  return Number.isInteger(n) && n >= min && n <= max;
};

module.exports = {
  isValidEmail,
  MAX_EMAIL_LENGTH,
  MAX_PASSWORD_LENGTH,
  isValidPhone,
  cleanPhone,
  isValidMACAddress,
  isValidIPAddress,
  isValidVoucherCode,
  VOUCHER_CODE_ALPHABET,
  VOUCHER_CODE_LENGTH,
  isValidUUID,
  isValidRouterToken,
  isValidName,
  nameRuleMessage,
  isWholeNumberBetween
};