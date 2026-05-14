const express = require('express');
const router  = express.Router();
const { createTransaction, getTransactions } = require('../controllers/transaction.controller');

// POST /api/transactions/create
router.post('/create', createTransaction);

// GET /api/transactions/
router.get('/', getTransactions);

module.exports = router;
