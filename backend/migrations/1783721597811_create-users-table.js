'use strict';

// First migration — staff/admin accounts (spec §4 `users`). These are the
// people who operate the ERP (owner / front desk / trainer), NOT gym members.
// Members get their own table in Phase 1.

exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // Role is a fixed enum so the DB itself enforces valid values.
  pgm.createType('user_role', ['owner', 'front_desk', 'trainer']);

  pgm.createTable('users', {
    id: 'id', // serial primary key
    name: { type: 'varchar(120)', notNull: true },
    email: { type: 'varchar(255)', notNull: true, unique: true },
    password_hash: { type: 'varchar(255)', notNull: true },
    role: { type: 'user_role', notNull: true },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });
  // The unique constraint on `email` already backs login lookups with an index.
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('users');
  pgm.dropType('user_role');
};
