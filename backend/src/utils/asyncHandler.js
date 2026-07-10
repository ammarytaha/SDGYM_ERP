'use strict';

// Wraps an async route handler so any rejected promise is forwarded to
// Express's error middleware instead of hanging the request. Use it on every
// async controller: router.post('/login', asyncHandler(login)).

/**
 * @param {Function} fn async (req, res, next) => ...
 * @returns {import('express').RequestHandler}
 */
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
