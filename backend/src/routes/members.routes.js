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

const router = express.Router();

// Every member route requires a valid token.
router.use(requireAuth);

// Reads — available to all roles (trainer is read-only, spec §6).
router.get('/', validate({ query: listMembersQuerySchema }), asyncHandler(controller.listMembers));
router.get('/:id', validate({ params: idParamSchema }), asyncHandler(controller.getMember));
router.get('/:id/qr', validate({ params: idParamSchema }), asyncHandler(controller.getMemberQr));

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
