const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');

// POST /api/disputes/
router.post('/', async (req, res, next) => {
  try {
    const { split_id, reason } = req.body;
    if (!split_id || !reason) {
      return res.status(400).json({ error: 'split_id and reason are required' });
    }

    const result = await pool.query(
      `INSERT INTO disputes (split_id, raised_by, reason)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [split_id, req.user.id, reason]
    );

    res.status(201).json({ dispute: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// GET /api/disputes/
router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT d.*, u.name AS raised_by_name
       FROM disputes d
       JOIN users u ON u.id = d.raised_by
       JOIN splits s ON s.id = d.split_id
       WHERE s.payee_id = $1 OR d.raised_by = $1
       ORDER BY d.created_at DESC`,
      [req.user.id]
    );
    res.json({ disputes: result.rows });
  } catch (err) {
    next(err);
  }
});

// PUT /api/disputes/:id/resolve
router.put('/:id/resolve', async (req, res, next) => {
  try {
    const result = await pool.query(
      `UPDATE disputes SET status = 'resolved', resolved_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Dispute not found' });
    }
    res.json({ dispute: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
