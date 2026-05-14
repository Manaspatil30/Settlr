const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');

// GET /api/users/search?q=phone_or_email
router.get('/search', async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Search query required' });

    const result = await pool.query(
      `SELECT id, name, email, phone FROM users
       WHERE (email ILIKE $1 OR phone ILIKE $1)
       AND id != $2
       LIMIT 10`,
      [`%${q}%`, req.user.id]
    );

    res.json({ users: result.rows });
  } catch (err) {
    next(err);
  }
});

// PUT /api/users/profile
router.put('/profile', async (req, res, next) => {
  try {
    const { name, phone, fcm_token } = req.body;

    const result = await pool.query(
      `UPDATE users SET
        name      = COALESCE($1, name),
        phone     = COALESCE($2, phone),
        fcm_token = COALESCE($3, fcm_token),
        updated_at = NOW()
       WHERE id = $4
       RETURNING id, name, email, phone`,
      [name, phone, fcm_token, req.user.id]
    );

    res.json({ user: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
