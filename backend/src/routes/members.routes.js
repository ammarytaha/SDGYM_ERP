'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  createMemberSchema,
  updateMemberSchema,
  listMembersQuerySchema,
  idParamSchema,
} = require('../validators/member.validators');
const controller = require('../controllers/members.controller');
const subscriptionsController = require('../controllers/subscriptions.controller');
const paymentsController = require('../controllers/payments.controller');

const router = express.Router();

// Every member route requires a valid token.
router.use(requireAuth);

// Reads — available to all roles (trainer is read-only, spec §6).
router.get('/', validate({ query: listMembersQuerySchema }), asyncHandler(controller.listMembers));
router.get('/:id', validate({ params: idParamSchema }), asyncHandler(controller.getMember));
router.get('/:id/qr', validate({ params: idParamSchema }), asyncHandler(controller.getMemberQr));
// A member's subscription history (spec §6 lists it under the members path).
router.get(
  '/:id/subscriptions',
  validate({ params: idParamSchema }),
  asyncHandler(subscriptionsController.listMemberSubscriptions)
);
// A member's payment history (spec §6 lists it under the members path).
router.get(
  '/:id/payments',
  validate({ params: idParamSchema }),
  asyncHandler(paymentsController.listMemberPayments)
);

// Writes — owner + front_desk only.
router.post(
  '/',
  requireRole('owner', 'front_desk'),
  validate({ body: createMemberSchema }),
  asyncHandler(controller.createMember)
);
router.patch(
  '/:id',
  requireRole('owner', 'front_desk'),
  validate({ params: idParamSchema, body: updateMemberSchema }),
  asyncHandler(controller.updateMember)
);

module.exports = router;
