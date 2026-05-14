const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const pool   = require('../config/db');
const stripeService = require('./stripe.service');

// ─────────────────────────────────────────
// REGISTER
// ─────────────────────────────────────────
const registerUser = async ({ name, email, phone, password }) => {
  // Check if user already exists
  let checkQuery = 'SELECT id FROM users WHERE email = $1';
const checkParams = [email];

if (phone && phone.trim() !== '') {
  checkQuery += ' OR phone = $2';
  checkParams.push(phone);
}

const existing = await pool.query(checkQuery, checkParams);
  if (existing.rows.length > 0) {
    const err = new Error('Email or phone already registered');
    err.status = 409;
    throw err;
  }

  // Hash password
  const password_hash = await bcrypt.hash(password, 12);

  // Insert user
  const result = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, email, phone, created_at`,
    [name, email, phone || null, password_hash]
  );

  const user = result.rows[0];
const token = generateToken(user);

// Create Stripe customer so they can make payments
try {
  await stripeService.createCustomer(user.id, user.email, user.name);
} catch (stripeErr) {
  console.error('⚠️ Stripe customer creation failed:', stripeErr.message);
  // Don't block registration if Stripe fails
}

return { user, token };
};

// ─────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────
const loginUser = async ({ email, password }) => {
  const result = await pool.query(
    'SELECT id, name, email, phone, password_hash FROM users WHERE email = $1',
    [email]
  );

  if (result.rows.length === 0) {
    const err = new Error('Invalid email or password');
    err.status = 401;
    throw err;
  }

  const user = result.rows[0];
  const isMatch = await bcrypt.compare(password, user.password_hash);

  if (!isMatch) {
    const err = new Error('Invalid email or password');
    err.status = 401;
    throw err;
  }

  const token = generateToken(user);
  const { password_hash, ...safeUser } = user;

  return { user: safeUser, token };
};

// ─────────────────────────────────────────
// GET ME
// ─────────────────────────────────────────
const getUser = async (userId) => {
  const result = await pool.query(
    `SELECT id, name, email, phone, stripe_account_id, created_at
     FROM users WHERE id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  return result.rows[0];
};

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────
const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

module.exports = { registerUser, loginUser, getUser };
