'use strict';

// zod schemas for the payments module. Same pattern as the other modules: rules
// live here, shared with the controller. `paymentInputSchema` (the money fields)
// is exported so the subscriptions validator can embed it for the atomic
// subscribe-and-pay flow.

const { z } = require('zod');

// '' / null (empty form fields) -> undefined so .optional() works cleanly.
const optionalDate = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.string().date('Use date format YYYY-MM-DD.').optional()
);

// The money fields — reused by POST /payments and the embedded subscribe payment.
const paymentInputSchema = z.object({
  // A payment is money in: must be > 0. Round to 2 decimals (piastres).
  amount: z.coerce
    .number()
    .positive('Amount must be greater than zero.')
    .max(99999999.99, 'Amount is too large.'),
  method: z.enum(['cash', 'card_manual', 'other']),
  // Optional; defaults to now() server-side. Lets the front desk backdate cash.
  paid_at: optionalDate,
  // Optional free-text (e.g. "دفعة أولى", "خصم").
  notes: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.string().trim().max(500, 'Note is too long.').optional()
  ),
});

// Standalone payment: also needs to say who + which subscription it's for.
const createPaymentSchema = paymentInputSchema.extend({
  member_id: z.coerce.number().int().positive('Invalid member id.'),
  subscription_id: z.coerce.number().int().positive('Invalid subscription id.'),
});

const idParamSchema = z.object({
  id: z.coerce.number().int().positive('Invalid id.'),
});

module.exports = {
  paymentInputSchema,
  createPaymentSchema,
  idParamSchema,
};
