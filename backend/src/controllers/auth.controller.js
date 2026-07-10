'use strict';

// Auth controller: login / logout / me.
// Staff accounts are provisioned (create-admin script / future admin UI) — there
// is no public signup, so there is no register endpoint here.

const { query } = require('../config/db');
const AppError = require('../utils/AppError');
const { ok } = require('../utils/apiResponse');
const { comparePassword } = require('../utils/password');
const { signToken } = require('../utils/jwt');

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Returns: { token, user: { id, name, email, role } }
 */
async function login(req, res) {
  const { email, password } = req.body || {};

  if (!email || !password) {
    throw new AppError('Email and password are required.', 400, 'MISSING_CREDENTIALS');
  }

  const result = await query(
    'SELECT id, name, email, password_hash, role FROM users WHERE email = $1',
    [String(email).toLowerCase().trim()]
  );
  const user = result.rows[0];

  // Same generic error whether the email is unknown or the password is wrong —
  // don't let attackers enumerate which emails exist.
  const invalid = new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
  if (!user) throw invalid;

  const matches = await comparePassword(password, user.password_hash);
  if (!matches) throw invalid;

  const token = signToken({ id: user.id, role: user.role, email: user.email });

  return ok(res, {
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}

/**
 * POST /api/auth/logout
 * JWTs are stateless, so there is no server session to destroy — the client
 * discards the token. This endpoint exists for a clean client contract and as
 * the future home of a token denylist if we ever need server-side revocation.
 */
async function logout(req, res) {
  return ok(res, { message: 'Logged out. Discard the token on the client.' });
}

/**
 * GET /api/auth/me  (requires auth)
 * Returns the current user, read fresh from the DB (so a deleted/updated
 * account is reflected rather than trusting stale token claims).
 */
async function me(req, res) {
  const result = await query(
    'SELECT id, name, email, role, created_at FROM users WHERE id = $1',
    [req.user.id]
  );
  const user = result.rows[0];
  if (!user) {
    throw new AppError('User no longer exists.', 401, 'USER_NOT_FOUND');
  }
  return ok(res, { user });
}

module.exports = { login, logout, me };
