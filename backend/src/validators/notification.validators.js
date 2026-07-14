'use strict';

// zod schema for reading the notifications log.

const { z } = require('zod');

const listNotificationsQuerySchema = z.object({
  member_id: z.coerce.number().int().positive('Invalid member id.').optional(),
});

module.exports = { listNotificationsQuerySchema };
