'use strict';

// zod schemas for the members module. Shared with the controller so validation
// rules live in one place.

const { z } = require('zod');

const MEMBER_STATUSES = ['active', 'frozen', 'expired', 'cancelled'];

// Lenient phone check — real Egyptian numbers come in several formats; we only
// enforce that it looks like a phone (digits and common separators).
const PHONE_REGEX = /^[0-9+\-\s]{7,20}$/;

// Treat empty string / null from a form as "not provided".
const optionalText = (schema) =>
  z.preprocess((v) => (v === '' || v === null ? undefined : v), schema.optional());

const fullName = z.string().trim().min(2, 'Name is too short.').max(160);
const phone = z
  .string()
  .trim()
  .regex(PHONE_REGEX, 'Enter a valid phone number.');
const email = optionalText(z.string().trim().toLowerCase().email('Enter a valid email.').max(255));
const photoUrl = optionalText(z.string().trim().max(512));
const status = z.enum(MEMBER_STATUSES);
const joinedAt = optionalText(z.string().date('Use date format YYYY-MM-DD.'));

const createMemberSchema = z.object({
  full_name: fullName,
  phone,
  email,
  photo_url: photoUrl,
  status: status.optional().default('active'),
  joined_at: joinedAt,
});

const updateMemberSchema = z
  .object({
    full_name: fullName.optional(),
    phone: phone.optional(),
    email,
    photo_url: photoUrl,
    status: status.optional(),
    joined_at: joinedAt,
  })
  .refine((obj) => Object.keys(obj).length > 0, { message: 'Provide at least one field to update.' });

const listMembersQuerySchema = z.object({
  search: optionalText(z.string().trim().max(160)),
  status: z.preprocess((v) => (v === '' || v === null ? undefined : v), status.optional()),
  page: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.coerce.number().int().positive().default(1)
  ),
  limit: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.coerce.number().int().positive().max(100).default(20)
  ),
});

const idParamSchema = z.object({
  id: z.coerce.number().int().positive('Invalid id.'),
});

module.exports = {
  MEMBER_STATUSES,
  createMemberSchema,
  updateMemberSchema,
  listMembersQuerySchema,
  idParamSchema,
};
