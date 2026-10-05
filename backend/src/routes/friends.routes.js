const express      = require('express');
const router       = express.Router();
const pool         = require('../config/db');
const { authenticate } = require('../middleware/auth.middleware');

// All routes require auth
router.use(authenticate);

// ─────────────────────────────────────────
// GET /api/friends
// Get the logged-in user's friends list
// ─────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email
       FROM friends f
       JOIN users u ON u.id = f.friend_id
       WHERE f.user_id = $1
       ORDER BY u.name ASC`,
      [req.user.id]
    );
    res.json({ friends: result.rows });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────
// GET /api/friends/recents
// People you've split with recently
// ─────────────────────────────────────────
router.get('/recents', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT ON (u.id) u.id, u.name, u.email, MAX(t.created_at) AS last_split
       FROM transactions t
       JOIN splits s ON s.transaction_id = t.id
       JOIN users u  ON u.id = s.payee_id
       WHERE t.payer_id = $1
       GROUP BY u.id, u.name, u.email
       ORDER BY u.id, last_split DESC
       LIMIT 6`,
      [req.user.id]
    );
    res.json({ recents: result.rows });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────
// POST /api/friends
// Add a friend by their userId
// ─────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const { friend_id } = req.body;

    if (!friend_id) return res.status(400).json({ error: 'friend_id is required' });
    if (friend_id === req.user.id) return res.status(400).json({ error: 'You cannot add yourself' });

    // Check user exists
    const userCheck = await pool.query('SELECT id, name, email FROM users WHERE id = $1', [friend_id]);
    if (userCheck.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    // Add friendship both ways so both users see each other
    await pool.query(
      `INSERT INTO friends (user_id, friend_id) VALUES ($1, $2), ($2, $1)
       ON CONFLICT DO NOTHING`,
      [req.user.id, friend_id]
    );

    res.json({ message: 'Friend added', friend: userCheck.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────
// DELETE /api/friends/:friendId
// Remove a friend
// ─────────────────────────────────────────
router.delete('/:friendId', async (req, res, next) => {
  try {
    await pool.query(
      `DELETE FROM friends
       WHERE (user_id = $1 AND friend_id = $2)
          OR (user_id = $2 AND friend_id = $1)`,
      [req.user.id, req.params.friendId]
    );
    res.json({ message: 'Friend removed' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
