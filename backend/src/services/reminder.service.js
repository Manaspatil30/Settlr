const Bull  = require('bull');
const pool  = require('../config/db');
const { sendDebtReminder, sendSplitNudge } = require('./notification.service');

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
  const { type, split_id, debt_id } = job.data;
  console.log(`⏰ Processing reminder job: ${type}`, { split_id, debt_id });

  if (type === 'no_response_check') {
    await handleNoResponseCheck(split_id);
  }

  if (type === 'split_nudge') {
    await sendSplitNudge(split_id);
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
// Schedule a pre-response nudge
// Fires while split is still pending
// ─────────────────────────────────────────
const scheduleSplitNudge = async (split_id, delayMs) => {
  await reminderQueue.add(
    { type: 'split_nudge', split_id },
    { delay: delayMs, attempts: 3, jobId: `${split_id}-nudge-${delayMs}` }
  );
};

// ─────────────────────────────────────────
// Schedule persistent reminders after debt created
// Fires Day 1, 2, 3, 5, 7, 10, 14
// Each job self-cancels if debt already settled
// ─────────────────────────────────────────
const scheduleNoResponseReminders = async (debt_id) => {
  const DAY = 24 * 60 * 60 * 1000;
  const delays = [
    { label: 'day1',  ms: 1  * DAY },
    { label: 'day2',  ms: 2  * DAY },
    { label: 'day3',  ms: 3  * DAY },
    { label: 'day5',  ms: 5  * DAY },
    { label: 'day7',  ms: 7  * DAY },
    { label: 'day10', ms: 10 * DAY },
    { label: 'day14', ms: 14 * DAY },
  ];

  for (const { label, ms } of delays) {
    await reminderQueue.add(
      { type: 'debt_reminder', debt_id },
      { delay: ms, attempts: 3, jobId: `${debt_id}-${label}` }
    );
  }

  console.log(`⏰ Persistent reminders (Day 1-14) scheduled for debt ${debt_id}`);
};

// ─────────────────────────────────────────
// Schedule Pay Later reminder
// Fires 1 day before due date
// ─────────────────────────────────────────
const schedulePayLaterReminder = async (debt_id, due_date) => {
  const dueMs    = new Date(due_date).getTime();
  const nowMs    = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;

  // Reminder 1 day before
  const beforeDelay = dueMs - oneDayMs - nowMs;
  if (beforeDelay > 0) {
    await reminderQueue.add(
      { type: 'debt_reminder', debt_id },
      { delay: beforeDelay, attempts: 3, jobId: `${debt_id}-before-due` }
    );
  }

  // Reminder on due date
  const onDueDelay = dueMs - nowMs;
  if (onDueDelay > 0) {
    await reminderQueue.add(
      { type: 'debt_reminder', debt_id },
      { delay: onDueDelay, attempts: 3, jobId: `${debt_id}-on-due` }
    );
  }

  console.log(`⏰ Pay-later reminders scheduled for debt ${debt_id}`);
};

module.exports = {
  scheduleNoResponseCheck,
  scheduleNoResponseReminders,
  schedulePayLaterReminder,
  scheduleSplitNudge,
};
