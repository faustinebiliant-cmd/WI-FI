// ============================================================
// OSWAGOTech WiFi - Create Platform Admin
// Run: node scripts/createPlatformAdmin.js
// ============================================================
const readline = require('readline');
const supabase = require('../config/supabase');
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
  
  // Check if exists
  const { data: existing } = await supabase.from('platform_admins').select('id').eq('email', cleanEmail).maybeSingle();
  if (existing) {
    console.log('Admin with this email already exists.');
    process.exit(1);
  }

  const hash = await hashPassword(password);

  const { error } = await supabase.from('platform_admins').insert({
    email: cleanEmail,
    full_name: fullName,
    password_hash: hash,
    is_active: true
  });

  if (error) {
    console.error('Failed to create admin:', error.message);
    process.exit(1);
  }

  console.log('Platform admin created successfully!');
  process.exit(0);
};

run();