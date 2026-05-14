const express = require('express');
const router  = express.Router();
const { acceptSplit, payLaterSplit, declineSplit, getPendingSplits } = require('../controllers/split.controller');

// GET  /api/splits/pending
router.get('/pending', getPendingSplits);

// PUT  /api/splits/:id/accept
router.put('/:id/accept', acceptSplit);

// PUT  /api/splits/:id/pay-later
router.put('/:id/pay-later', payLaterSplit);

// PUT  /api/splits/:id/decline
router.put('/:id/decline', declineSplit);

module.exports = router;
