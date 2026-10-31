// ============================================================
// Oswagolink - Create Platform Admin (Raw PostgreSQL)
// Run: node scripts/createPlatformAdmin.js
// ============================================================
const readline = require('readline');
const db = require('../config/db');
const { hashPassword } = require('../services/password');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const ask = (question) => new Promise((resolve) => rl.question(question, resolve));

const run = async () => {
  console.log('--- Create Platform Admin ---');
  const email = await ask('Email: ');
  const fullName = await ask('Full Name: ');
  const password = await ask('Password (min 6 chars): ');

  if (!email || !fullName || !password) {
    console.log('All fields are required.');
    process.exit(1);
  }

  const cleanEmail = email.toLowerCase().trim();
  
  try {
    // Check if exists
    const { rows } = await db.query('SELECT id FROM platform_admins WHERE email = $1', [cleanEmail]);
    if (rows.length > 0) {
      console.log('Admin with this email already exists.');
      process.exit(1);
    }

    const hash = await hashPassword(password);

    await db.query(
      `INSERT INTO platform_admins (email, full_name, password_hash, is_active) 
       VALUES ($1, $2, $3, true)`,
      [cleanEmail, fullName, hash]
    );

    console.log('Platform admin created successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Failed to create admin:', error.message);
    process.exit(1);
  }
};

run();