'use strict';

// Gym members (spec §4 `members`). These are the customers — distinct from the
// staff `users` table. Every later module (subscriptions, payments, check-ins,
// notifications) references a member.

exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // Same four lifecycle states used across the app; a dedicated enum for members
  // keeps the DB authoritative on valid values.
  pgm.createType('member_status', ['active', 'frozen', 'expired', 'cancelled']);

  pgm.createTable('members', {
    id: 'id', // serial primary key
    full_name: { type: 'varchar(160)', notNull: true },
    // Unique — used for WhatsApp messaging and as the front-desk lookup key.
    phone: { type: 'varchar(32)', notNull: true, unique: true },
    email: { type: 'varchar(255)' },
    photo_url: { type: 'varchar(512)' },
    joined_at: { type: 'date', notNull: true, default: pgm.func('current_date') },
    status: { type: 'member_status', notNull: true, default: 'active' },
    // Random token generated on creation; encoded into the member's QR code.
    qr_code_token: { type: 'varchar(64)', notNull: true, unique: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // The members list screen filters by status — index it.
  pgm.createIndex('members', 'status');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('members');
  pgm.dropType('member_status');
};
