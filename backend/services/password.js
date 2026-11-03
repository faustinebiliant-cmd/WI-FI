// ============================================================
// Oswagolink - Password Service
// ============================================================
const crypto = require('crypto');
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 12;

const hashPassword = async (plainText) => {
  return await bcrypt.hash(plainText, SALT_ROUNDS);
};

const verifyPassword = async (plainText, hash) => {
  return await bcrypt.compare(plainText, hash);
};

// A login for an email nobody has must take exactly as long as a wrong password,
// otherwise a stranger could time the answers to learn which emails have accounts.
// So the password is checked against a made-up hash (same strength) and thrown away.
let dummyHash = null;
const wasteSameTime = async (plainText) => {
  if (!dummyHash) dummyHash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), SALT_ROUNDS);
  await bcrypt.compare(plainText, dummyHash);
  return false;
};

module.exports = {
  hashPassword,
  verifyPassword,
  wasteSameTime
};