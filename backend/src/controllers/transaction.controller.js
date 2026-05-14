const pool                 = require('../config/db');
const { emitToUser }       = require('../config/socket');
const { sendSplitRequest } = require('../services/notification.service');
const { scheduleNoResponseCheck } = require('../services/reminder.service');

// POST /api/transactions/create
// Body: { total_amount, currency, merchant_name, splits: [{ payee_id, amount }] }
const createTransaction = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { total_amount, currency = 'GBP', merchant_name, splits } = req.body;
    const payer_id = req.user.id;

    // Validate
    if (!total_amount || !splits || splits.length === 0) {
      return res.status(400).json({ error: 'total_amount and splits are required' });
    }

    const splitTotal = splits.reduce((sum, s) => sum + parseFloat(s.amount), 0);
    if (splitTotal <= 0) {
      return res.status(400).json({ error: 'Split amounts must be greater than zero' });
    }
    if (splitTotal > parseFloat(total_amount) + 0.01) {
      return res.status(400).json({ error: 'Split amounts cannot exceed total amount' });
    }

    await client.query('BEGIN');

    // 1. Create transaction
    const txResult = await client.query(
      `INSERT INTO transactions (payer_id, total_amount, currency, merchant_name, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING *`,
      [payer_id, total_amount, currency, merchant_name]
    );
    const transaction = txResult.rows[0];

    // 2. Create split records
    const splitRecords = [];
    for (const split of splits) {
      const splitResult = await client.query(
        `INSERT INTO splits (transaction_id, payee_id, amount, status)
         VALUES ($1, $2, $3, 'pending')
         RETURNING *`,
        [transaction.id, split.payee_id, split.amount]
      );
      splitRecords.push(splitResult.rows[0]);
    }

    await client.query('COMMIT');

    // 3. Send notifications to each payee (outside transaction)
    for (const split of splitRecords) {
      // FCM push notification
      await sendSplitRequest(split, transaction, req.user.name);

      // WebSocket — if payee has app open
      emitToUser(split.payee_id, 'split:request', {
        split,
        transaction,
        payer_name: req.user.name
      });

      // Schedule no-response check after 1 hour
      await scheduleNoResponseCheck(split.id, 60 * 60 * 1000);
    }

    // 4. Update transaction status to completed
    await pool.query(
      `UPDATE transactions SET status = 'completed', updated_at = NOW() WHERE id = $1`,
      [transaction.id]
    );

    res.status(201).json({
      message: 'Transaction created and split requests sent',
      transaction,
      splits: splitRecords
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// GET /api/transactions/
const getTransactions = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT t.*,
              json_agg(json_build_object(
                'id', s.id,
                'payee_id', s.payee_id,
                'payee_name', u.name,
                'amount', s.amount,
                'status', s.status,
                'pay_later_date', s.pay_later_date
              )) AS splits
       FROM transactions t
       LEFT JOIN splits s ON s.transaction_id = t.id
       LEFT JOIN users u ON u.id = s.payee_id
       WHERE t.payer_id = $1
       GROUP BY t.id
       ORDER BY t.created_at DESC`,
      [req.user.id]
    );
    res.json({ transactions: result.rows });
  } catch (err) {
    next(err);
  }
};

module.exports = { createTransaction, getTransactions };
