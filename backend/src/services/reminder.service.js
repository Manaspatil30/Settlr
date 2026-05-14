const Bull  = require('bull');
const pool  = require('../config/db');
const { sendDebtReminder } = require('./notification.service');

// Redis-backed job queue
const reminderQueue = new Bull('reminders', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
  }
});

// ─────────────────────────────────────────
// PROCESS JOBS
// ─────────────────────────────────────────
reminderQueue.process(async (job) => {
  const { type, split_id, debt_id, user_id } = job.data;
  console.log(`⏰ Processing reminder job: ${type} for split ${split_id}`);

  if (type === 'no_response_check') {
    await handleNoResponseCheck(split_id);
  }

  if (type === 'debt_reminder') {
    await sendDebtReminder(debt_id);
  }
});

// ─────────────────────────────────────────
// NO RESPONSE CHECK — fires after 1 hour
// If split is still pending → convert to debt
// ─────────────────────────────────────────
const handleNoResponseCheck = async (split_id) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const splitResult = await client.query(
      `SELECT s.*, t.payer_id FROM splits s
       JOIN transactions t ON t.id = s.transaction_id
       WHERE s.id = $1 AND s.status = 'pending'`,
      [split_id]
    );

    if (splitResult.rows.length === 0) {
      // Split already responded — nothing to do
      await client.query('ROLLBACK');
      return;
    }

    const split = splitResult.rows[0];

    // Mark as no_response
    await client.query(
      `UPDATE splits SET status = 'no_response', updated_at = NOW() WHERE id = $1`,
      [split_id]
    );

    // Create debt record
    const debtResult = await client.query(
      `INSERT INTO debts (split_id, debtor_id, creditor_id, amount, type)
       VALUES ($1, $2, $3, $4, 'no_response')
       RETURNING id`,
      [split_id, split.payee_id, split.payer_id, split.amount]
    );

    await client.query('COMMIT');

    const debt_id = debtResult.rows[0].id;

    // Schedule Day 1, Day 3, Day 7 reminders
    await scheduleNoResponseReminders(debt_id);

    console.log(`📋 Split ${split_id} → no_response → debt ${debt_id} created`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ No-response check failed:', err.message);
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────
// Schedule no-response check (1 hour)
// ─────────────────────────────────────────
const scheduleNoResponseCheck = async (split_id, delayMs = 60 * 60 * 1000) => {
  await reminderQueue.add(
    { type: 'no_response_check', split_id },
    { delay: delayMs, attempts: 3 }
  );
  console.log(`⏰ No-response check scheduled for split ${split_id}`);
};

// ─────────────────────────────────────────
// Schedule Day 1, Day 3, Day 7 reminders
// for no_response debts
// ─────────────────────────────────────────
const scheduleNoResponseReminders = async (debt_id) => {
  const delays = [
    { label: 'day1', ms: 1  * 24 * 60 * 60 * 1000 },
    { label: 'day3', ms: 3  * 24 * 60 * 60 * 1000 },
    { label: 'day7', ms: 7  * 24 * 60 * 60 * 1000 },
  ];

  for (const { label, ms } of delays) {
    await reminderQueue.add(
      { type: 'debt_reminder', debt_id },
      { delay: ms, attempts: 3, jobId: `${debt_id}-${label}` }
    );
  }

  console.log(`⏰ Day 1/3/7 reminders scheduled for debt ${debt_id}`);
};

// ─────────────────────────────────────────
// Schedule Pay Later reminder
// Fires 1 day before due date
// ─────────────────────────────────────────
const schedulePayLaterReminder = async (split_id, user_id, due_date) => {
  const dueMs   = new Date(due_date).getTime();
  const nowMs   = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;

  // Reminder 1 day before
  const beforeDelay = dueMs - oneDayMs - nowMs;
  if (beforeDelay > 0) {
    await reminderQueue.add(
      { type: 'debt_reminder', split_id, user_id },
      { delay: beforeDelay, attempts: 3, jobId: `${split_id}-before-due` }
    );
  }

  // Reminder on due date
  const onDueDelay = dueMs - nowMs;
  if (onDueDelay > 0) {
    await reminderQueue.add(
      { type: 'debt_reminder', split_id, user_id },
      { delay: onDueDelay, attempts: 3, jobId: `${split_id}-on-due` }
    );
  }

  console.log(`⏰ Pay-later reminders scheduled for split ${split_id}`);
};

module.exports = {
  scheduleNoResponseCheck,
  scheduleNoResponseReminders,
  schedulePayLaterReminder
};
