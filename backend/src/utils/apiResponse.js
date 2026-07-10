'use strict';

// Every response in this API uses one of these two shapes so the frontend can
// rely on a single contract:
//   success -> { success: true,  data: <payload> }
//   failure -> { success: false, error: { message, code? } }

/**
 * Send a success response.
 * @param {import('express').Response} res
 * @param {*} data Payload to wrap under `data`
 * @param {number} [status=200] HTTP status code
 */
function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}

/**
 * Send an error response.
 * @param {import('express').Response} res
 * @param {string} message Human-readable message (safe to show)
 * @param {number} [status=400] HTTP status code
 * @param {string} [code] Optional machine-readable error code
 */
function fail(res, message, status = 400, code) {
  const error = { message };
  if (code) error.code = code;
  return res.status(status).json({ success: false, error });
}

module.exports = { ok, fail };
