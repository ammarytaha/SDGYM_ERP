'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { login, logout, me } = require('../controllers/auth.controller');

const router = express.Router();

// Public
router.post('/login', asyncHandler(login));
router.post('/logout', asyncHandler(logout));

// Protected
router.get('/me', requireAuth, asyncHandler(me));

module.exports = router;
