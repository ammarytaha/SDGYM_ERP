'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  createCheckinSchema,
  listCheckinsQuerySchema,
} = require('../validators/checkin.validators');
const controller = require('../controllers/checkins.controller');

const router = express.Router();

// Every check-in route requires a valid token.
router.use(requireAuth);

// Read the attendance log — all roles (trainer is read-only, spec §6).
router.get('/', validate({ query: listCheckinsQuerySchema }), asyncHandler(controller.listCheckins));

// Record a check-in — owner + front_desk (the front desk runs the kiosk).
router.post(
  '/',
  requireRole('owner', 'front_desk'),
  validate({ body: createCheckinSchema }),
  asyncHandler(controller.createCheckin)
);

module.exports = router;
