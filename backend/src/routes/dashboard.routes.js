'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const controller = require('../controllers/dashboard.controller');

const router = express.Router();

// The dashboard surfaces revenue and outstanding dues — owner only (spec §6
// keeps financials with the owner; front desk uses المتابعة for operations).
router.use(requireAuth);

router.get('/', requireRole('owner'), asyncHandler(controller.getDashboard));

module.exports = router;
