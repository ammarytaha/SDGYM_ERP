'use strict';

// Auth middleware. Every route except the public ones (login, logout, health)
// should sit behind requireAuth. requireRole layers role checks on top for the
// permission rules in the spec (§6): e.g. only 'owner' manages plans.

const AppError = require('../utils/AppError');
const { verifyToken } = require('../utils/jwt');

/**
 * Require a valid Bearer JWT. On success, attaches req.user = { id, role, email }.
 * @type {import('express').RequestHandler}
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new AppError('Authentication required.', 401, 'AUTH_REQUIRED'));
  }

  try {
    const decoded = verifyToken(token);
    req.user = { id: decoded.id, role: decoded.role, email: decoded.email };
    return next();
  } catch (err) {
    return next(new AppError('Invalid or expired token.', 401, 'AUTH_INVALID'));
  }
}

/**
 * Require the authenticated user to hold one of the given roles.
 * Must be used after requireAuth. Example: requireRole('owner')
 * @param {...string} roles Allowed roles
 * @returns {import('express').RequestHandler}
 */
function requireRole(...roles) {
  return function roleGuard(req, res, next) {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401, 'AUTH_REQUIRED'));
    }
    if (!roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to do that.', 403, 'FORBIDDEN'));
    }
    return next();
  };
}

module.exports = { requireAuth, requireRole };
