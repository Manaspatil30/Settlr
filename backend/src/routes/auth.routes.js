const express = require('express');
const router  = express.Router();
const { register, login, logout, getMe } = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.post('/register', register);
router.post('/login',    login);
router.post('/logout',   authenticate, logout);
router.get('/me',        authenticate, getMe);

module.exports = router;
