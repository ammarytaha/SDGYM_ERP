'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  createSubscriptionSchema,
  patchSubscriptionSchema,
  idParamSchema,
} = require('../validators/subscription.validators');
const controller = require('../controllers/subscriptions.controller');

const router = express.Router();

// Every subscription route requires a valid token.
router.use(requireAuth);

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
