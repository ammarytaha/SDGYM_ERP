'use strict';

// Liveness + DB connectivity probe. Public on purpose so uptime checks and the
// smoke test can hit it without a token. Reports whether Postgres answered.

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { checkConnection } = require('../config/db');
const { ok } = require('../utils/apiResponse');

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    let db = 'down';
    try {
      db = (await checkConnection()) ? 'up' : 'down';
    } catch (err) {
      db = 'down';
    }
    return ok(res, {
      status: db === 'up' ? 'ok' : 'degraded',
      db,
      uptime_seconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  })
);

module.exports = router;
