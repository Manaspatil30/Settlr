const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');

// GET /api/debts/
router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT d.*, u.name AS creditor_name
       FROM debts d
       JOIN users u ON u.id = d.creditor_id
       WHERE d.debtor_id = $1 AND d.settled_at IS NULL
       ORDER BY d.created_at DESC`,
      [req.user.id]
    );
    res.json({ debts: result.rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/debts/upcoming
router.get('/upcoming', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT d.*, u.name AS creditor_name
       FROM debts d
       JOIN users u ON u.id = d.creditor_id
       WHERE d.debtor_id = $1
         AND d.type = 'pay_later'
         AND d.settled_at IS NULL
         AND d.due_date <= NOW() + INTERVAL '2 days'
       ORDER BY d.due_date ASC`,
      [req.user.id]
    );
    res.json({ debts: result.rows });
  } catch (err) {
    next(err);
  }
});

// PUT /api/debts/:id/settle
router.put('/:id/settle', async (req, res, next) => {
  try {
    const result = await pool.query(
      `UPDATE debts SET settled_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND debtor_id = $2
       RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Debt not found' });
    }
    res.json({ debt: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
