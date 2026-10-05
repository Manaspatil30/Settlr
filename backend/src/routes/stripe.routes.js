const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const {
  createConnectAccount,
  createOnboardingLink,
  createPaymentIntent,
  getAccountStatus,
} = require("../services/stripe.service");
const { sendPayerNotification } = require("../services/notification.service");
const { authenticate } = require("../middleware/auth.middleware");
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// ─────────────────────────────────────────
// POST /api/stripe/connect
// Create a Stripe Connect account for the user
// so they can receive split transfers
// ─────────────────────────────────────────
router.post("/connect", authenticate, async (req, res, next) => {
  try {
    const userResult = await pool.query(
      "SELECT email, stripe_account_id FROM users WHERE id = $1",
      [req.user.id],
    );
    const user = userResult.rows[0];

    if (user.stripe_account_id) {
      return res.json({
        message: "Connect account already exists",
        accountId: user.stripe_account_id,
      });
    }

    const account = await createConnectAccount(req.user.id, user.email);
    res.json({ accountId: account.id });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────
// GET /api/stripe/onboarding
// Get the Stripe onboarding URL
// User visits this to add bank details
// ─────────────────────────────────────────
router.get("/onboarding", authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT stripe_account_id FROM users WHERE id = $1",
      [req.user.id],
    );
    const { stripe_account_id } = result.rows[0];

    if (!stripe_account_id) {
      return res
        .status(400)
        .json({ error: "No Connect account found. Call /connect first." });
    }

    const url = await createOnboardingLink(stripe_account_id);
    res.json({ url });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────
// GET /api/stripe/status
// Check if user's Connect account can receive money
// ─────────────────────────────────────────
router.get("/status", authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT stripe_account_id FROM users WHERE id = $1",
      [req.user.id],
    );
    const { stripe_account_id } = result.rows[0];

    if (!stripe_account_id) {
      return res.json({ connected: false });
    }

    const status = await getAccountStatus(stripe_account_id);
    res.json({ connected: true, ...status });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────
// POST /api/stripe/payment-intent
// Create a PaymentIntent for a split amount
// Frontend uses this to show the payment sheet
// ─────────────────────────────────────────
router.post("/payment-intent", authenticate, async (req, res, next) => {
  try {
    const { split_id, debt_id } = req.body;

    if (!split_id && !debt_id) {
      return res.status(400).json({ error: "split_id or debt_id is required" });
    }

    let amount, payer_stripe_account, payee_customer_id;

    if (split_id) {
      const result = await pool.query(
        `SELECT s.amount, s.status,
            u.stripe_account_id AS payer_stripe_account,
            payee.stripe_customer_id AS payee_customer_id
     FROM splits s
     JOIN transactions t ON t.id = s.transaction_id
     JOIN users u ON u.id = t.payer_id
     JOIN users payee ON payee.id = s.payee_id
     WHERE s.id = $1 AND s.payee_id = $2`,
        [split_id, req.user.id],
      );
      if (result.rows.length === 0)
        return res.status(404).json({ error: "Split not found" });
      if (result.rows[0].status !== "pending")
        return res.status(400).json({ error: "Split already responded to" });
      ({ amount, payer_stripe_account, payee_customer_id } = result.rows[0]);
    } else {
      const result = await pool.query(
        `SELECT d.amount,
            u.stripe_account_id AS payer_stripe_account,
            payee.stripe_customer_id AS payee_customer_id
     FROM debts d
     JOIN users u ON u.id = d.creditor_id
     JOIN users payee ON payee.id = d.debtor_id
     WHERE d.id = $1 AND d.debtor_id = $2`,
        [debt_id, req.user.id],
      );
      if (result.rows.length === 0)
        return res.status(404).json({ error: "Debt not found" });
      ({ amount, payer_stripe_account, payee_customer_id } = result.rows[0]);
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: "gbp",
      ...(payee_customer_id && { customer: payee_customer_id }),
      payment_method_types: ["card"],
      ...(payer_stripe_account && {
        transfer_data: { destination: payer_stripe_account },
        application_fee_amount: 2,
      }),
      metadata: {
        type:     split_id ? 'split' : 'debt',
        split_id: split_id ? String(split_id) : '',
        debt_id:  debt_id  ? String(debt_id)  : '',
        payee_id: String(req.user.id),
      },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────
// POST /api/stripe/webhook
// Stripe calls this when a payment succeeds
// Must use raw body — registered in app.js before express.json()
// ─────────────────────────────────────────
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig     = req.headers['stripe-signature'];
  const secret  = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (err) {
    console.error('⚠️  Webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`🔔 Stripe webhook: ${event.type}`);

  if (event.type === 'payment_intent.succeeded') {
    const pi       = event.data.object;
    const { type, split_id, debt_id, payee_id } = pi.metadata;
    console.log(`💳 PaymentIntent metadata:`, { type, split_id, debt_id });

    try {
      if (type === 'split' && split_id) {
        const result = await pool.query(
          `UPDATE splits SET
             status     = 'settled',
             settled_at = NOW(),
             updated_at = NOW()
           WHERE id = $1 AND status NOT IN ('settled', 'declined')`,
          [split_id]
        );

        if (result.rowCount > 0) {
          const infoRes = await pool.query(
            `SELECT t.payer_id, s.amount
             FROM splits s JOIN transactions t ON t.id = s.transaction_id
             WHERE s.id = $1`,
            [split_id]
          );
          const { payer_id, amount } = infoRes.rows[0];
          await sendPayerNotification(payer_id, {
            type:     'split:accepted',
            message:  `Payment received — £${amount} is on its way to you.`,
            split_id,
          });
          console.log(`✅ Webhook: split ${split_id} settled`);
        }
      }

      if (type === 'debt' && debt_id) {
        const result = await pool.query(
          `UPDATE debts SET
             settled_at = NOW(),
             updated_at = NOW()
           WHERE id = $1 AND settled_at IS NULL
           RETURNING creditor_id, amount`,
          [debt_id]
        );

        if (result.rows.length > 0) {
          const { creditor_id, amount } = result.rows[0];
          await sendPayerNotification(creditor_id, {
            type:    'debt:settled',
            message: `Payment received — £${amount} debt has been settled.`,
            split_id: debt_id,
          });
          console.log(`✅ Webhook: debt ${debt_id} settled`);
        }
      }
    } catch (err) {
      console.error('❌ Webhook handler error:', err.message);
      // Still return 200 so Stripe doesn't retry — the error is logged
    }
  }

  res.json({ received: true });
});

module.exports = router;
