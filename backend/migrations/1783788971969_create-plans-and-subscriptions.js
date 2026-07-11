'use strict';

// Membership plans (the products the gym sells) and subscriptions (a member's
// enrolment in a plan for a date range). Spec §4. Subscriptions are what drive a
// member's real lifecycle — the Phase 2 controllers keep members.status in sync
// with the member's current subscription, and freezing pauses the clock by
// extending end_date on unfreeze.

exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // Same four lifecycle states as members, but a dedicated enum so the two
  // domains can evolve independently.
  pgm.createType('subscription_status', ['active', 'frozen', 'expired', 'cancelled']);

  pgm.createTable('membership_plans', {
    id: 'id', // serial primary key
    name: { type: 'varchar(120)', notNull: true },
    duration_days: { type: 'integer', notNull: true },
    // numeric(10,2): up to ~99,999,999.99 — plenty for EGP membership prices.
    price: { type: 'numeric(10,2)', notNull: true },
    // Retire a plan without deleting it (keeps historical subscriptions valid).
    active: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  // DB-level guard rails.
  pgm.addConstraint('membership_plans', 'membership_plans_duration_positive', {
    check: 'duration_days > 0',
  });
  pgm.addConstraint('membership_plans', 'membership_plans_price_nonneg', {
    check: 'price >= 0',
  });
  // Unique names double as the idempotent seed's conflict target.
  pgm.addConstraint('membership_plans', 'membership_plans_name_unique', { unique: 'name' });

  pgm.createTable('subscriptions', {
    id: 'id',
    // Delete a member -> their subscriptions go with them.
    member_id: { type: 'integer', notNull: true, references: '"members"', onDelete: 'CASCADE' },
    // Never delete a plan that subscriptions point at (retire it via active=false).
    plan_id: {
      type: 'integer',
      notNull: true,
      references: '"membership_plans"',
      onDelete: 'RESTRICT',
    },
    start_date: { type: 'date', notNull: true },
    // Computed server-side (start_date + plan.duration_days); extended on unfreeze.
    end_date: { type: 'date', notNull: true },
    status: { type: 'subscription_status', notNull: true, default: 'active' },
    // Freeze window — frozen_from is set on freeze; the gap to unfreeze is added
    // back onto end_date so paid time isn't lost.
    frozen_from: { type: 'date' },
    frozen_until: { type: 'date' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  // Profile history is per-member; expiry sweeps scan end_date; lists filter status.
  pgm.createIndex('subscriptions', 'member_id');
  pgm.createIndex('subscriptions', 'status');
  pgm.createIndex('subscriptions', 'end_date');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('subscriptions');
  pgm.dropTable('membership_plans');
  pgm.dropType('subscription_status');
};
