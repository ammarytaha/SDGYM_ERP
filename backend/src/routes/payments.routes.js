'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const { createPaymentSchema } = require('../validators/payment.validators');
const controller = require('../controllers/payments.controller');

const router = express.Router();

// Every payment route requires a valid token.
router.use(requireAuth);

// Record a standalone payment — owner + front_desk (spec §6). The member-scoped
// read (GET /api/members/:id/payments) lives on the members router.
router.post(
  '/',
  requireRole('owner', 'front_desk'),
  validate({ body: createPaymentSchema }),
  asyncHandler(controller.createPayment)
);

module.exports = router;
