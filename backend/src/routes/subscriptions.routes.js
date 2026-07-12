'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  createSubscriptionSchema,
  patchSubscriptionSchema,
  idParamSchema,
  attentionQuerySchema,
} = require('../validators/subscription.validators');
const controller = require('../controllers/subscriptions.controller');

const router = express.Router();

// Every subscription route requires a valid token.
router.use(requireAuth);

// Follow-up lists (renewals due + outstanding balances) — owner + front_desk.
// Declared before the write routes; it's a distinct static path so order is moot,
// but grouping the read here keeps the file readable.
router.get(
  '/attention',
  requireRole('owner', 'front_desk'),
  validate({ query: attentionQuerySchema }),
  asyncHandler(controller.listAttention)
);

// Writes — owner + front_desk (the front desk subscribes/freezes/cancels daily).
router.post(
  '/',
  requireRole('owner', 'front_desk'),
  validate({ body: createSubscriptionSchema }),
  asyncHandler(controller.createSubscription)
);
router.patch(
  '/:id',
  requireRole('owner', 'front_desk'),
  validate({ params: idParamSchema, body: patchSubscriptionSchema }),
  asyncHandler(controller.patchSubscription)
);

module.exports = router;
