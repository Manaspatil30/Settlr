const axios = require('axios');

const TRUELAYER_AUTH_URL = 'https://auth.truelayer-sandbox.com';
const TRUELAYER_API_URL  = 'https://api.truelayer-sandbox.com';

const CLIENT_ID     = process.env.TRUELAYER_CLIENT_ID;
const CLIENT_SECRET = process.env.TRUELAYER_CLIENT_SECRET;
const REDIRECT_URI  = process.env.TRUELAYER_REDIRECT_URI;

// ─────────────────────────────────────────
// Generate the URL to send the user to
// so they can log in with their bank
// ─────────────────────────────────────────
const getAuthUrl = (userId) => {
  const nonce = Math.random().toString(36).substring(2);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     CLIENT_ID,
    scope:         'accounts balance transactions offline_access',
    redirect_uri:  REDIRECT_URI,
    nonce,
    providers:     'uk-cs-mock',
    state:         userId,
  });

  const url = `${TRUELAYER_AUTH_URL}/?${params.toString()}`;
  console.log('🔗 TrueLayer auth URL:', url);
  return url;
};

// ─────────────────────────────────────────
// Exchange the code for an access token
// Called when TrueLayer redirects back
// ─────────────────────────────────────────
const exchangeCode = async (code) => {
  const res = await axios.post(`${TRUELAYER_AUTH_URL}/connect/token`, {
    grant_type:    'authorization_code',
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri:  REDIRECT_URI,
    code,
  });

  return res.data;
  // returns { access_token, refresh_token, expires_in }
};

// ─────────────────────────────────────────
// Fetch the latest transactions for a user
// Called after webhook or on demand
// ─────────────────────────────────────────
const getTransactions = async (accessToken) => {
  const headers = { Authorization: `Bearer ${accessToken}` };

  // Step 1 — get accounts
  const accountsRes = await axios.get(`${TRUELAYER_API_URL}/data/v1/accounts`, { headers });
  const accounts = accountsRes.data.results;

  if (!accounts || accounts.length === 0) return [];

  // Step 2 — get transactions for the first account
  const accountId = accounts[0].account_id;
  const from = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const to   = new Date().toISOString();

  const [txRes, pendingRes] = await Promise.all([
    axios.get(`${TRUELAYER_API_URL}/data/v1/accounts/${accountId}/transactions`, { headers, params: { from, to } }).catch(() => ({ data: { results: [] } })),
    axios.get(`${TRUELAYER_API_URL}/data/v1/accounts/${accountId}/transactions/pending`, { headers }).catch(() => ({ data: { results: [] } })),
  ]);

  const all = [...(txRes.data.results || []), ...(pendingRes.data.results || [])];
  // Only debits — money leaving the account (negative amount = the user paid)
  return all.filter(t => t.amount < 0);
};

// ─────────────────────────────────────────
// Refresh an expired access token
// ─────────────────────────────────────────
const refreshToken = async (refreshTokenValue) => {
  const res = await axios.post(`${TRUELAYER_AUTH_URL}/connect/token`, {
    grant_type:    'refresh_token',
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: refreshTokenValue,
  });

  return res.data;
};

module.exports = { getAuthUrl, exchangeCode, getTransactions, refreshToken };