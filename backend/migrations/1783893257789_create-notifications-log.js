'use strict';

// Notifications log (spec §4/§8). Every WhatsApp send attempt — welcome, check-in
// confirmation, renewal reminder, payment-overdue reminder — is recorded here with
// its outcome and the template + params used, whether it went to Meta or (with no
// creds) was logged in dry-run mode. This is the audit trail the front desk reads.

exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createType('notification_type', [
    'welcome',
    'checkin_confirmation',
    'renewal_reminder',
    'payment_overdue',
  ]);
  pgm.createType('notification_status', ['sent', 'failed']);

  pgm.createTable('notifications_log', {
    id: 'id', // serial primary key
    // Delete a member -> their notification history goes with them.
    member_id: { type: 'integer', notNull: true, references: '"members"', onDelete: 'CASCADE' },
    type: { type: 'notification_type', notNull: true },
    sent_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    status: { type: 'notification_status', notNull: true },
    // The template name + params + Meta response (or dry-run marker) / error.
    payload: { type: 'jsonb' },
  });

  // Per-member history + the daily-dedup lookup (member + type + day).
  pgm.createIndex('notifications_log', 'member_id');
  pgm.createIndex('notifications_log', 'sent_at');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('notifications_log');
  pgm.dropType('notification_status');
  pgm.dropType('notification_type');
};
