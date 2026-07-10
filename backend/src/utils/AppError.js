'use strict';

// A predictable, operational error. Throw this from controllers/services when
// you want a specific HTTP status and message to reach the client. Anything
// that is NOT an AppError is treated as an unexpected 500 by the error handler
// (its message is hidden from the client).

class AppError extends Error {
  /**
   * @param {string} message Client-safe message
   * @param {number} [statusCode=400] HTTP status code
   * @param {string} [code] Optional machine-readable code (e.g. 'INVALID_CREDENTIALS')
   */
  constructor(message, statusCode = 400, code) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
