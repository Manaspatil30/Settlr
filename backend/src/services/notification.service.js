const pool = require('../config/db');
const https = require('https');

// Lazy-load Firebase to avoid crash if credentials not set in dev
// let firebaseAdmin;
// const getFirebase = () => {
//   if (!firebaseAdmin && process.env.FIREBASE_PROJECT_ID) {
//     firebaseAdmin = require('firebase-admin');
//     if (!firebaseAdmin.apps.length) {
//       firebaseAdmin.initializeApp({
//         credential: firebaseAdmin.credential.cert({
//           projectId:   process.env.FIREBASE_PROJECT_ID,
//           privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
//           clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
//         }),
//       });
//     }
//   }
//   return firebaseAdmin;
// };

// // ─────────────────────────────────────────
// // Send FCM push to a user by userId
// // ─────────────────────────────────────────
// const sendPushToUser = async (userId, { title, body, data = {} }) => {
//   try {
//     // Get user's FCM token
//     const result = await pool.query(
//       'SELECT fcm_token FROM users WHERE id = $1',
//       [userId]
//     );

//     if (!result.rows[0]?.fcm_token) {
//       console.log(`ℹ️  No FCM token for user ${userId} — skipping push`);
//       return;
//     }

//     const admin = getFirebase();
//     if (!admin) {
//       console.log('ℹ️  Firebase not configured — skipping push notification');
//       return;
//     }

//     await admin.messaging().send({
//       token: result.rows[0].fcm_token,
//       notification: { title, body },
//       data,
//     });

//     console.log(`📲 Push sent to user ${userId}: ${body}`);
//   } catch (err) {
//     // Never crash the app because a notification failed
//     console.error(`❌ Push notification failed for ${userId}:`, err.message);
//   }
// };

const sendPushToUser = async (userId, { title, body, data = {}, categoryId }) => {
  try {
    const result = await pool.query(
      'SELECT fcm_token FROM users WHERE id = $1',
      [userId]
    );

    const token = result.rows[0]?.fcm_token;
    if (!token) {
      console.log(`ℹ️  No push token for user ${userId} — skipping`);
      return;
    }

    const message = { to: token, title, body, data };
    if (categoryId) message.categoryId = categoryId;
    const payload = JSON.stringify(message);

    const options = {
      hostname: 'exp.host',
      path:     '/--/api/v2/push/send',
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        res.on('data', () => {});
        res.on('end', resolve);
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });

    console.log(`📲 Push sent to user ${userId}: ${body}`);
  } catch (err) {
    console.error(`❌ Push failed for ${userId}:`, err.message);
  }
};

// ─────────────────────────────────────────
// Send split request to payee
// ─────────────────────────────────────────
const sendSplitRequest = async (split, transaction, payerName) => {
  await sendPushToUser(split.payee_id, {
    title:      `💸 ${payerName} paid at ${transaction.merchant_name || 'a merchant'}`,
    body:       `Your share is £${split.amount} — don't make them wait!`,
    categoryId: 'SPLIT_REQUEST',
    data: {
      type:     'split:request',
      split_id: String(split.id),
      amount:   String(split.amount),
    },
  });
};

// ─────────────────────────────────────────
// Notify payer of a split update
// ─────────────────────────────────────────
const sendPayerNotification = async (payerId, { type, message, split_id }) => {
  await sendPushToUser(payerId, {
    title: 'Settlr',
    body:  message,
    data: { type, split_id },
  });
};

// ─────────────────────────────────────────
// Nudge a payee who hasn't responded yet
// ─────────────────────────────────────────
const sendSplitNudge = async (splitId) => {
  const result = await pool.query(
    `SELECT s.*, u.name AS payer_name
     FROM splits s
     JOIN transactions t ON t.id = s.transaction_id
     JOIN users u ON u.id = t.payer_id
     WHERE s.id = $1 AND s.status = 'pending'`,
    [splitId]
  );

  if (!result.rows[0]) return; // Already responded — do nothing

  const split = result.rows[0];

  await sendPushToUser(split.payee_id, {
    title: `👀 ${split.payer_name} is waiting`,
    body:  `You still haven't responded to a £${split.amount} split request.`,
    categoryId: 'SPLIT_REQUEST',
    data: {
      type:     'split:request',
      split_id: String(split.id),
      amount:   String(split.amount),
    },
  });
};

// ─────────────────────────────────────────
// Send debt reminder to debtor
// ─────────────────────────────────────────
const sendDebtReminder = async (debtId) => {
  const result = await pool.query(
    `SELECT d.*, u.name AS creditor_name
     FROM debts d
     JOIN users u ON u.id = d.creditor_id
     WHERE d.id = $1`,
    [debtId]
  );

  if (!result.rows[0]) return;
  const debt = result.rows[0];

  await sendPushToUser(debt.debtor_id, {
    title: 'Settlr — Outstanding Payment',
    body:  `You still owe £${debt.amount} to ${debt.creditor_name}. Tap to settle.`,
    data: { type: 'debt:reminder', debt_id: debtId },
  });

  // Update reminder count and timestamp
  await pool.query(
    `UPDATE debts SET
      reminder_count   = reminder_count + 1,
      last_reminder_at = NOW(),
      updated_at       = NOW()
     WHERE id = $1`,
    [debtId]
  );
};

module.exports = { sendPushToUser, sendSplitRequest, sendPayerNotification, sendDebtReminder, sendSplitNudge };
