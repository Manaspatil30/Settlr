const express          = require('express');
const router           = express.Router();
const pool             = require('../config/db');
const { authenticate } = require('../middleware/auth.middleware');
const {
  getAuthUrl,
  exchangeCode,
  getTransactions,
} = require('../services/truelayer.service');
const { sendPushToUser } = require('../services/notification.service');

// ─────────────────────────────────────────
// GET /api/banking/connect
// Returns the TrueLayer URL for the user
// to log in with their bank
// ─────────────────────────────────────────
router.get('/connect', authenticate, (req, res) => {
  const url = getAuthUrl(req.user.id);
  res.json({ url });
});

// ─────────────────────────────────────────
// GET /api/banking/callback
// TrueLayer redirects here after bank login
// Exchanges code for tokens and saves them
// ─────────────────────────────────────────
router.get('/callback', async (req, res) => {
  try {
    const { code, state: userId } = req.query;

    if (!code || !userId) {
      return res.status(400).send('Missing code or state');
    }

    // Exchange code for tokens
    const tokens = await exchangeCode(code);

    // Save tokens to database
    await pool.query(
      `UPDATE users SET
        truelayer_access_token  = $1,
        truelayer_refresh_token = $2,
        truelayer_connected     = TRUE,
        updated_at              = NOW()
       WHERE id = $3`,
      [tokens.access_token, tokens.refresh_token, userId]
    );

    // Close the browser and tell user to return to app
    res.send(`
      <html>
        <body style="font-family:sans-serif;text-align:center;padding-top:100px">
          <h2>✅ Bank Connected!</h2>
          <p>Return to Settlr and you're all set.</p>
          <script>setTimeout(() => window.close(), 3000)</script>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('TrueLayer callback error:', err.message);
    res.status(500).send('Connection failed. Please try again.');
  }
});

// ─────────────────────────────────────────
// POST /api/banking/check-transactions
// Called manually or by a scheduled job
// Checks for new payments and notifies user
// ─────────────────────────────────────────
router.post('/check-transactions', authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT truelayer_access_token, truelayer_connected FROM users WHERE id = $1',
      [req.user.id]
    );

    const user = result.rows[0];

    if (!user.truelayer_connected || !user.truelayer_access_token) {
      return res.status(400).json({ error: 'Bank not connected' });
    }

    const transactions = await getTransactions(user.truelayer_access_token);

    if (transactions.length === 0) {
      return res.json({ message: 'No recent transactions' });
    }

    // Take the most recent transaction
    const latest = transactions[0];
    const amount   = Math.abs(latest.amount).toFixed(2);
    const merchant = latest.merchant_name || latest.description || 'a merchant';

    // Send push notification asking if they want to split
    await sendPushToUser(req.user.id, {
      title: '💸 Split this payment?',
      body:  `You paid £${amount} at ${merchant} — split with friends?`,
      data:  {
        screen:   'NewSplit',
        amount,
        merchant,
      },
    });

    res.json({ message: 'Notification sent', amount, merchant });
  } catch (err) {
    console.error('Check transactions error:', err.message);
    next(err);
  }
});

// ─────────────────────────────────────────
// GET /api/banking/status
// Check if user has connected their bank
// ─────────────────────────────────────────
router.get('/status', authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT truelayer_connected FROM users WHERE id = $1',
      [req.user.id]
    );
    res.json({ connected: result.rows[0]?.truelayer_connected || false });
  } catch (err) {
    next(err);
  }
});

module.exports = router;