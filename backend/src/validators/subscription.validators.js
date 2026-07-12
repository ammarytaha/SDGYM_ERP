'use strict';

// zod schemas for the subscriptions module. Same pattern as the other modules.

const { z } = require('zod');
const { paymentInputSchema } = require('./payment.validators');

const optionalDate = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.string().date('Use date format YYYY-MM-DD.').optional()
);

const createSubscriptionSchema = z.object({
  member_id: z.coerce.number().int().positive('Invalid member id.'),
  plan_id: z.coerce.number().int().positive('Invalid plan id.'),
  // Optional — defaults to today server-side. end_date is always computed.
  start_date: optionalDate,
  // Optional total the member agreed to pay (Phase 3b). Defaults to the plan
  // price server-side; can be lowered for a discount. Balance = this - payments.
  agreed_total: z.coerce
    .number()
    .nonnegative('Agreed total cannot be negative.')
    .max(99999999.99, 'Agreed total is too large.')
    .optional(),
  // Optional opening payment recorded atomically with the subscription (Phase 3).
  // When present, the subscription + this payment commit or roll back together.
  payment: paymentInputSchema.optional(),
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

// GET /subscriptions/attention?within=7 — the renewal window in days.
const attentionQuerySchema = z.object({
  within: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? 7 : v),
    z.coerce.number().int().min(1, 'within must be at least 1.').max(90, 'within cannot exceed 90.')
  ),
});

module.exports = {
  createSubscriptionSchema,
  patchSubscriptionSchema,
  idParamSchema,
  attentionQuerySchema,
};
