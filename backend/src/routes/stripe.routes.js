const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const {
  createConnectAccount,
  createOnboardingLink,
  createPaymentIntent,
  getAccountStatus,
} = require("../services/stripe.service");
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
    const { split_id, currency } = req.body;

    if (!split_id)
      return res.status(400).json({ error: "split_id is required" });

    const userResult = await pool.query(
      `SELECT s.amount, 
          s.status,
          u.stripe_account_id AS payer_stripe_account,
          payee.stripe_customer_id AS payee_customer_id
   FROM splits s
   JOIN transactions t ON t.id = s.transaction_id
   JOIN users u ON u.id = t.payer_id
   JOIN users payee ON payee.id = s.payee_id
   WHERE s.id = $1 AND s.payee_id = $2`,
      [split_id, req.user.id],
    );

    if (userResult.rows.length === 0)
      return res.status(404).json({ error: "Split not found" });
    const split = userResult.rows[0];
    if (split.status !== "pending")
      return res.status(400).json({ error: "Split already responded to" });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(split.amount * 100), // convert to pence
      currency: "gbp",
      ...(split.payee_customer_id && { customer: split.payee_customer_id }), // who is being charged
      payment_method_types: ["card"],
      ...(split.payer_stripe_account && {
    transfer_data: { destination: split.payer_stripe_account },
    application_fee_amount: 2,
  }),// Settlr takes 2p
      metadata: { split_id: split_id },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
