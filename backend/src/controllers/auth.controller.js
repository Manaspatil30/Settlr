const { registerUser, loginUser, getUser } = require('../services/auth.service');

// POST /api/auth/register
const register = async (req, res, next) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const { user, token } = await registerUser({ name, email, phone, password });

    res.status(201).json({
      message: 'Account created successfully',
      token,
      user
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/login
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const { user, token } = await loginUser({ email, password });

    res.json({
      message: 'Login successful',
      token,
      user
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/logout
const logout = async (req, res) => {
  // JWT is stateless — client drops the token
  // Future: add token to Redis blacklist here
  res.json({ message: 'Logged out successfully' });
};

// GET /api/auth/me
const getMe = async (req, res, next) => {
  try {
    const user = await getUser(req.user.id);
    res.json({ user });
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, logout, getMe };
