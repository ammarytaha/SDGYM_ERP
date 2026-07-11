'use strict';

// zod schemas for the subscriptions module. Same pattern as the other modules.

const { z } = require('zod');

const optionalDate = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.string().date('Use date format YYYY-MM-DD.').optional()
);

const createSubscriptionSchema = z.object({
  member_id: z.coerce.number().int().positive('Invalid member id.'),
  plan_id: z.coerce.number().int().positive('Invalid plan id.'),
  // Optional — defaults to today server-side. end_date is always computed.
  start_date: optionalDate,
});

// Freeze / unfreeze / cancel all go through PATCH with an explicit action so the
// state machine lives in one place (the controller).
const patchSubscriptionSchema = z.object({
  action: z.enum(['freeze', 'unfreeze', 'cancel']),
  // Optional planned unfreeze date; informational, does not drive the clock.
  frozen_until: optionalDate,
});

const idParamSchema = z.object({
  id: z.coerce.number().int().positive('Invalid id.'),
});

module.exports = {
  createSubscriptionSchema,
  patchSubscriptionSchema,
  idParamSchema,
};
