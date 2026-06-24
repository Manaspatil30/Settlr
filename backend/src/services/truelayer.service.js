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
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     CLIENT_ID,
    scope:         'info accounts balance transactions offline_access',
    redirect_uri:  REDIRECT_URI,
    providers:     'uk-ob-all uk-oauth-all',
    state:         userId, // we pass userId so we know who connected on callback
  });

  return `${TRUELAYER_AUTH_URL}/?${params.toString()}`;
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
  const res = await axios.get(
    `${TRUELAYER_API_URL}/data/v1/transactions`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      params:  {
        from: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // last 5 minutes
        to:   new Date().toISOString(),
      },
    }
  );

  return res.data.results;
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