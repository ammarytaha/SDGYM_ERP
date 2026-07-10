'use strict';

// Central error handling. Two pieces:
//   notFound     -> turns an unmatched route into a clean 404 JSON error
//   errorHandler -> the last middleware; converts anything thrown/forwarded
//                   into the standard { success:false, error } envelope.
// Operational AppErrors surface their message + status. Anything unexpected is
// logged server-side and returned as a generic 500 (never leak a stack trace).

const AppError = require('../utils/AppError');
const { fail } = require('../utils/apiResponse');

/** @type {import('express').RequestHandler} */
function notFound(req, res) {
  return fail(res, `Route not found: ${req.method} ${req.originalUrl}`, 404, 'NOT_FOUND');
}

/** @type {import('express').ErrorRequestHandler} */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return fail(res, err.message, err.statusCode, err.code);
  }

  // Malformed JSON body (thrown by express.json()).
  if (err.type === 'entity.parse.failed') {
    return fail(res, 'Invalid JSON in request body.', 400, 'INVALID_JSON');
  }

  // Unexpected/unknown error: log the details, hide them from the client.
  // eslint-disable-next-line no-console
  console.error('[error] Unhandled error:', err);
  return fail(res, 'Something went wrong. Please try again.', 500, 'INTERNAL_ERROR');
}

module.exports = { notFound, errorHandler };
