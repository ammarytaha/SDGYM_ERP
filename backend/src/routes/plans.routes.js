'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  createPlanSchema,
  updatePlanSchema,
  listPlansQuerySchema,
  idParamSchema,
} = require('../validators/plan.validators');
const controller = require('../controllers/plans.controller');

const router = express.Router();

// Every plan route requires a valid token.
router.use(requireAuth);

// Read — all roles (front desk / trainer need to see plans, e.g. the picker).
router.get('/', validate({ query: listPlansQuerySchema }), asyncHandler(controller.listPlans));

// Writes — owner only (spec §6: front_desk cannot manage plans).
router.post(
  '/',
  requireRole('owner'),
  validate({ body: createPlanSchema }),
  asyncHandler(controller.createPlan)
);
router.patch(
  '/:id',
  requireRole('owner'),
  validate({ params: idParamSchema, body: updatePlanSchema }),
  asyncHandler(controller.updatePlan)
);

module.exports = router;
