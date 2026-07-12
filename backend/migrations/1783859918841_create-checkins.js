'use strict';

// Check-ins / attendance (spec §4/§5). Each scan at the front-desk kiosk is
// logged — successful entries AND denied attempts (expired/frozen/no subscription)
// — so attendance is `result='allowed'` and denied entry attempts stay on record.
// `method` distinguishes a QR scan from a manual front-desk override.

exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createType('checkin_method', ['qr', 'manual']);
  pgm.createType('checkin_result', ['allowed', 'denied']);

  pgm.createTable('checkins', {
    id: 'id', // serial primary key
    // Delete a member -> their check-ins go with them.
    member_id: { type: 'integer', notNull: true, references: '"members"', onDelete: 'CASCADE' },
    checked_in_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    method: { type: 'checkin_method', notNull: true },
    // allowed = valid active subscription; denied = expired/frozen/no subscription.
    result: { type: 'checkin_result', notNull: true },
  });

  // Per-member history + date-scoped counts (today's attendance).
  pgm.createIndex('checkins', 'member_id');
  pgm.createIndex('checkins', 'checked_in_at');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('checkins');
  pgm.dropType('checkin_result');
  pgm.dropType('checkin_method');
};
