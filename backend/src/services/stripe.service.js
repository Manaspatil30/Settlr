const Stripe = require('stripe');
const pool   = require('../config/db');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// ─────────────────────────────────────────
// Create a Stripe Customer for a new user
// Called on register
// ─────────────────────────────────────────
const createCustomer = async (userId, email, name) => {
  const customer = await stripe.customers.create({ email, name });

  await pool.query(
    'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
    [customer.id, userId]
  );

  return customer;
};

// ─────────────────────────────────────────
// Create a Stripe Connect Express Account
// This gives the user a bank account to receive money
// Called when user sets up payouts
// ─────────────────────────────────────────
const createConnectAccount = async (userId, email) => {
  const account = await stripe.accounts.create({
    type:    'express',
    email,
    capabilities: {
      transfers: { requested: true },
    },
  });

  await pool.query(
    'UPDATE users SET stripe_account_id = $1 WHERE id = $2',
    [account.id, userId]
  );

  return account;
};

// ─────────────────────────────────────────
// Generate onboarding link for Connect account
// User clicks this to add their bank details
// ─────────────────────────────────────────
const createOnboardingLink = async (accountId) => {
  const link = await stripe.accountLinks.create({
    account:     accountId,
    refresh_url: `${process.env.CLIENT_URL}/stripe/refresh`,
    return_url:  `${process.env.CLIENT_URL}/stripe/return`,
    type:        'account_onboarding',
  });

  return link.url;
};

// ─────────────────────────────────────────
// Create a PaymentIntent
// Used when payer initiates the full payment
// ─────────────────────────────────────────
const createPaymentIntent = async (amount, currency = 'gbp', customerId) => {
  const paymentIntent = await stripe.paymentIntents.create({
    amount:   Math.round(amount * 100), // Stripe uses pence
    currency,
    customer: customerId,
    payment_method_types: ['card'],
    metadata: { app: 'settlr' },
  });

  return paymentIntent;
};

// ─────────────────────────────────────────
// Transfer split share back to payer
// Called when a payee accepts their split
//
// Flow:
//   Payee's card is charged → money held by Settlr platform
//   Transfer fires → money moves to payer's Connect account
// ─────────────────────────────────────────
const transferToPayer = async ({ amount, currency = 'gbp', payerStripeAccountId, splitId }) => {
  const transfer = await stripe.transfers.create({
    amount:      Math.round(amount * 100), // pence
    currency,
    destination: payerStripeAccountId,    // payer's Connect account
    metadata: {
      split_id: splitId,
      app:      'settlr',
    },
  });

  return transfer;
};

// ─────────────────────────────────────────
// Charge a payee's saved payment method
// and transfer to payer in one step
// (Requires payee to have a saved card)
// ─────────────────────────────────────────
const chargeAndTransfer = async ({
  amount,
  currency = 'gbp',
  payeeCustomerId,
  payerStripeAccountId,
  paymentMethodId,
  splitId,
}) => {
  // Step 1: Charge payee
  const paymentIntent = await stripe.paymentIntents.create({
    amount:         Math.round(amount * 100),
    currency,
    customer:       payeeCustomerId,
    payment_method: paymentMethodId,
    confirm:        true,
    // Settlr takes £0.02 application fee per settled split
    application_fee_amount: 2,
    transfer_data: {
      destination: payerStripeAccountId, // directly routes to payer
    },
    metadata: { split_id: splitId, app: 'settlr' },
  });

  return paymentIntent;
};

// ─────────────────────────────────────────
// Get Connect account status
// Check if payer can receive transfers
// ─────────────────────────────────────────
const getAccountStatus = async (accountId) => {
  const account = await stripe.accounts.retrieve(accountId);
  return {
    chargesEnabled:   account.charges_enabled,
    payoutsEnabled:   account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
  };
};

module.exports = {
  createCustomer,
  createConnectAccount,
  createOnboardingLink,
  createPaymentIntent,
  transferToPayer,
  chargeAndTransfer,
  getAccountStatus,
};
