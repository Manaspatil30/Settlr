const pool                    = require('../config/db');
const { emitToUser }          = require('../config/socket');
const { sendPayerNotification } = require('../services/notification.service');
const { schedulePayLaterReminder, scheduleNoResponseReminders } = require('../services/reminder.service');
const stripeService           = require('../services/stripe.service');

// ─────────────────────────────────────────
// GET /api/splits/pending
// ─────────────────────────────────────────
const getPendingSplits = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT s.*, t.merchant_name, t.total_amount, t.currency,
              u.name AS payer_name
       FROM splits s
       JOIN transactions t ON t.id = s.transaction_id
       JOIN users u ON u.id = t.payer_id
       WHERE s.payee_id = $1 AND s.status = 'pending'
       ORDER BY s.created_at DESC`,
      [req.user.id]
    );
    res.json({ splits: result.rows });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────
// PUT /api/splits/:id/accept
// Payee pays now — triggers Stripe transfer
// ─────────────────────────────────────────
const acceptSplit = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get split and verify payee
    const splitResult = await client.query(
      `SELECT s.*, t.payer_id, t.merchant_name, u.stripe_account_id AS payer_stripe_account
       FROM splits s
       JOIN transactions t ON t.id = s.transaction_id
       JOIN users u ON u.id = t.payer_id
       WHERE s.id = $1 AND s.payee_id = $2`,
      [req.params.id, req.user.id]
    );

    if (splitResult.rows.length === 0) {
      return res.status(404).json({ error: 'Split not found' });
    }

    const split = splitResult.rows[0];

    if (split.status !== 'pending') {
      return res.status(400).json({ error: `Split already ${split.status}` });
    }

    // Fire Stripe transfer — move split amount to payer's Connect account
    // if (split.payer_stripe_account && process.env.STRIPE_SECRET_KEY) {
    //   try {
    //     const transfer = await stripeService.transferToPayer({
    //       amount:               split.amount,
    //       currency:             'gbp',
    //       payerStripeAccountId: split.payer_stripe_account,
    //       splitId:              split.id,
    //     });
    //     await client.query(
    //       'UPDATE splits SET stripe_transfer_id = $1 WHERE id = $2',
    //       [transfer.id, split.id]
    //     );
    //   } catch (stripeErr) {
    //     console.error('⚠️  Stripe transfer failed:', stripeErr.message);
    //   }
    // }

    // Update split status
    await client.query(
      `UPDATE splits SET
        status = 'settled',
        responded_at = NOW(),
        settled_at = NOW(),
        updated_at = NOW()
       WHERE id = $1`,
      [split.id]
    );

    await client.query('COMMIT');

    // Notify payer via FCM + WebSocket
    await sendPayerNotification(split.payer_id, {
      type: 'split:accepted',
      message: `${req.user.name} paid £${split.amount}`,
      split_id: split.id
    });

    emitToUser(split.payer_id, 'split:accepted', {
      split_id: split.id,
      payee_name: req.user.name,
      amount: split.amount
    });

    res.json({ message: 'Payment accepted and settled', split_id: split.id });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────
// PUT /api/splits/:id/pay-later
// Body: { due_date: "2026-04-30T18:00:00Z" }
// ─────────────────────────────────────────
const payLaterSplit = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { due_date } = req.body;

    if (!due_date) {
      return res.status(400).json({ error: 'due_date is required' });
    }

    // Validate due date is in the future
    if (new Date(due_date) <= new Date()) {
      return res.status(400).json({ error: 'due_date must be in the future' });
    }

    await client.query('BEGIN');

    const splitResult = await client.query(
      `SELECT s.*, t.payer_id, t.merchant_name
       FROM splits s
       JOIN transactions t ON t.id = s.transaction_id
       WHERE s.id = $1 AND s.payee_id = $2`,
      [req.params.id, req.user.id]
    );

    if (splitResult.rows.length === 0) {
      return res.status(404).json({ error: 'Split not found' });
    }

    const split = splitResult.rows[0];

    if (split.status !== 'pending') {
      return res.status(400).json({ error: `Split already ${split.status}` });
    }

    // Update split to pay_later
    await client.query(
      `UPDATE splits SET
        status = 'pay_later',
        pay_later_date = $1,
        responded_at = NOW(),
        updated_at = NOW()
       WHERE id = $2`,
      [due_date, split.id]
    );

    // Create debt record — type: pay_later
    await client.query(
      `INSERT INTO debts (split_id, debtor_id, creditor_id, amount, type, due_date)
       VALUES ($1, $2, $3, $4, 'pay_later', $5)`,
      [split.id, req.user.id, split.payer_id, split.amount, due_date]
    );

    await client.query('COMMIT');

    // Schedule reminder 1 day before due date
    await schedulePayLaterReminder(split.id, req.user.id, due_date);

    // Notify payer
    await sendPayerNotification(split.payer_id, {
      type: 'split:pay_later',
      message: `${req.user.name} will pay £${split.amount} by ${new Date(due_date).toDateString()}`,
      split_id: split.id
    });

    emitToUser(split.payer_id, 'split:pay_later', {
      split_id: split.id,
      payee_name: req.user.name,
      amount: split.amount,
      due_date
    });

    res.json({ message: 'Pay later date confirmed', due_date });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────
// PUT /api/splits/:id/decline
// Body: { reason: "I didn't order that" }
// ─────────────────────────────────────────
const declineSplit = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: 'A reason is required when declining' });
    }

    await client.query('BEGIN');

    const splitResult = await client.query(
      `SELECT s.*, t.payer_id, t.merchant_name
       FROM splits s
       JOIN transactions t ON t.id = s.transaction_id
       WHERE s.id = $1 AND s.payee_id = $2`,
      [req.params.id, req.user.id]
    );

    if (splitResult.rows.length === 0) {
      return res.status(404).json({ error: 'Split not found' });
    }

    const split = splitResult.rows[0];

    if (split.status !== 'pending') {
      return res.status(400).json({ error: `Split already ${split.status}` });
    }

    // Update split status
    await client.query(
      `UPDATE splits SET
        status = 'declined',
        decline_reason = $1,
        responded_at = NOW(),
        updated_at = NOW()
       WHERE id = $2`,
      [reason, split.id]
    );

    // Create dispute record
    await client.query(
      `INSERT INTO disputes (split_id, raised_by, reason)
       VALUES ($1, $2, $3)`,
      [split.id, req.user.id, reason]
    );

    await client.query('COMMIT');

    // Notify payer — no reminders sent to decliner
    await sendPayerNotification(split.payer_id, {
      type: 'split:declined',
      message: `${req.user.name} declined £${split.amount}. Reason: ${reason}`,
      split_id: split.id
    });

    emitToUser(split.payer_id, 'split:declined', {
      split_id: split.id,
      payee_name: req.user.name,
      amount: split.amount,
      reason
    });

    res.json({ message: 'Split declined', split_id: split.id });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

module.exports = { getPendingSplits, acceptSplit, payLaterSplit, declineSplit };
