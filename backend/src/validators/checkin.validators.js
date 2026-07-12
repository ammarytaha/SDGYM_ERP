'use strict';

// zod schemas for the check-ins module. A check-in comes either from a QR scan
// (qr_code_token) or a manual front-desk override (member_id) — exactly one. The
// `method` is derived server-side from which was sent, never taken from the client.

const { z } = require('zod');

const optionalDate = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.string().date('Use date format YYYY-MM-DD.').optional()
);

const createCheckinSchema = z
  .object({
    qr_code_token: z.preprocess(
      (v) => (v === '' || v === null ? undefined : v),
      z.string().trim().min(1, 'QR token is empty.').optional()
    ),
    member_id: z.coerce.number().int().positive('Invalid member id.').optional(),
  })
  .refine(
    (obj) => (obj.qr_code_token ? 1 : 0) + (obj.member_id ? 1 : 0) === 1,
    { message: 'Provide exactly one of qr_code_token or member_id.' }
  );

const listCheckinsQuerySchema = z.object({
  date: optionalDate,
  member_id: z.coerce.number().int().positive('Invalid member id.').optional(),
});

module.exports = {
  createCheckinSchema,
  listCheckinsQuerySchema,
};
