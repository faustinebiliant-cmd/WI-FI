// The same rules as the server (backend/utils/validators.js). Typing a character that
// is not allowed simply does nothing; the server checks everything again anyway.

// Names: letters, numbers, spaces and . , - ' & ( ) only
export const onlyNameChars = (value) => value.replace(/[^A-Za-z0-9 .,'&()-]/g, '');

// Numbers typed as text (prices, Lipa Namba)
export const onlyDigits = (value) => value.replace(/[^0-9]/g, '');

// Phone numbers: digits and a leading +
export const onlyPhoneChars = (value) => value.replace(/[^0-9+]/g, '');

export const MAX_EMAIL_LENGTH = 50;
export const MAX_PASSWORD_LENGTH = 50;
