// ============================================================
// Oswagolink - Password Service
// ============================================================
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 12;

const hashPassword = async (plainText) => {
  return await bcrypt.hash(plainText, SALT_ROUNDS);
};

const verifyPassword = async (plainText, hash) => {
  return await bcrypt.compare(plainText, hash);
};

module.exports = {
  hashPassword,
  verifyPassword
};