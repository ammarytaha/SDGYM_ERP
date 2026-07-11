'use strict';

// zod schemas for the membership_plans module. Same pattern as
// member.validators.js: rules live here, shared with the controller.

const { z } = require('zod');

// Accept a real boolean or the strings 'true'/'false' (forms/query strings).
const boolish = z.preprocess((v) => {
  if (typeof v === 'boolean') return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return v;
}, z.boolean());

const name = z.string().trim().min(2, 'Plan name is too short.').max(120);
const durationDays = z.coerce
  .number()
  .int('Duration must be a whole number of days.')
  .positive('Duration must be greater than zero.');
const price = z.coerce.number().nonnegative('Price cannot be negative.');

const createPlanSchema = z.object({
  name,
  duration_days: durationDays,
  price,
  active: boolish.optional().default(true),
});

const updatePlanSchema = z
  .object({
    name: name.optional(),
    duration_days: durationDays.optional(),
    price: price.optional(),
    active: boolish.optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, { message: 'Provide at least one field to update.' });

const listPlansQuerySchema = z.object({
  // Optional filter: 'true' -> only active, 'false' -> only retired.
  active: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.enum(['true', 'false']).optional()
  ),
});

const idParamSchema = z.object({
  id: z.coerce.number().int().positive('Invalid id.'),
});

module.exports = {
  createPlanSchema,
  updatePlanSchema,
  listPlansQuerySchema,
  idParamSchema,
};
