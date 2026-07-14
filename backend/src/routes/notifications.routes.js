'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { listNotificationsQuerySchema } = require('../validators/notification.validators');
const controller = require('../controllers/notifications.controller');

const router = express.Router();

// Every notifications route requires a valid token. Read-only for all roles.
router.use(requireAuth);

router.get(
  '/log',
  validate({ query: listNotificationsQuerySchema }),
  asyncHandler(controller.listNotificationsLog)
);

module.exports = router;
