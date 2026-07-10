'use strict';

// Generic request validator built on zod. Establishes the validation pattern for
// every module: define zod schemas, then `validate({ body, query, params })` on
// the route. Parsed/coerced results are attached to `req.valid.{body,query,params}`
// — we don't mutate req.query because Express defines it as a getter-only prop.
//
// Any schema failure becomes a 400 with the standard error envelope (via the
// central error handler), surfacing the first offending field.

const { ZodError } = require('zod');
const AppError = require('../utils/AppError');

/**
 * @param {{ body?: import('zod').ZodTypeAny, query?: import('zod').ZodTypeAny, params?: import('zod').ZodTypeAny }} schemas
 * @returns {import('express').RequestHandler}
 */
function validate(schemas) {
  return function validator(req, res, next) {
    try {
      req.valid = req.valid || {};
      if (schemas.body) req.valid.body = schemas.body.parse(req.body);
      if (schemas.query) req.valid.query = schemas.query.parse(req.query);
      if (schemas.params) req.valid.params = schemas.params.parse(req.params);
      return next();
    } catch (err) {
      if (err instanceof ZodError) {
        const issue = err.issues[0];
        const field = issue.path.join('.');
        const message = field ? `${field}: ${issue.message}` : issue.message;
        return next(new AppError(message, 400, 'VALIDATION_ERROR'));
      }
      return next(err);
    }
  };
}

module.exports = validate;
