'use strict';

// Mounts all API route groups under /api. Feature modules (members, plans,
// subscriptions, payments, checkins, notifications) will be added here in later
// phases — one router per module.

const express = require('express');
const authRoutes = require('./auth.routes');
const healthRoutes = require('./health.routes');
const membersRoutes = require('./members.routes');
const plansRoutes = require('./plans.routes');
const subscriptionsRoutes = require('./subscriptions.routes');
const paymentsRoutes = require('./payments.routes');

const router = express.Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/members', membersRoutes);
router.use('/plans', plansRoutes);
router.use('/subscriptions', subscriptionsRoutes);
router.use('/payments', paymentsRoutes);

module.exports = router;
