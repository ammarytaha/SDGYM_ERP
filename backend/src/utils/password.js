'use strict';

// Password hashing helpers. We never store plaintext passwords — only bcrypt
// hashes. bcryptjs is pure JavaScript (no native build step), which keeps
// setup painless across Windows/Mac/Linux.

const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

/**
 * Hash a plaintext password for storage.
 * @param {string} plain
 * @returns {Promise<string>} bcrypt hash
 */
function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/**
 * Compare a plaintext attempt against a stored hash.
 * @param {string} plain
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

module.exports = { hashPassword, comparePassword };
