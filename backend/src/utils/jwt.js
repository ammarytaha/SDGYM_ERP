'use strict';

// Thin wrapper around jsonwebtoken so signing/verifying is centralised and the
// secret + expiry come from one place (config). Tokens carry the minimum
// needed to authorise a request: the user id, role, and email.

const jwt = require('jsonwebtoken');
const config = require('../config/env');

/**
 * Sign a JWT for an authenticated user.
 * @param {{ id: number, role: string, email: string }} payload
 * @returns {string} signed token
 */
function signToken(payload) {
  return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
}

/**
 * Verify and decode a JWT. Throws if invalid/expired.
 * @param {string} token
 * @returns {object} decoded payload
 */
function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret);
}

module.exports = { signToken, verifyToken };
