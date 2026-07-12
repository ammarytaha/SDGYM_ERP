'use strict';

// Payments (spec §4). A payment records money a member handed over — amount,
// method, when — always linked to the subscription it paid for. The money and
// the time (subscription) don't line up 1:1 in a cash gym: one subscription can
// have zero, one, or several payments (installments, late cash, comped time),
// which is why this is its own table rather than fields on subscriptions.

exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // No payment gateway in the MVP — all entries are manual (spec §3).
  pgm.createType('payment_method', ['cash', 'card_manual', 'other']);

  pgm.createTable('payments', {
    id: 'id', // serial primary key
    // Delete a member -> their payments go with them.
    member_id: { type: 'integer', notNull: true, references: '"members"', onDelete: 'CASCADE' },
    // Every payment is for a specific subscription (spec §4: subscription_id is
    // not nullable). Cascades with the subscription (which cascades with the
    // member), so history stays consistent.
    subscription_id: {
      type: 'integer',
      notNull: true,
      references: '"subscriptions"',
      onDelete: 'CASCADE',
    },
    // numeric(10,2): up to ~99,999,999.99 EGP — matches the plan price column.
    amount: { type: 'numeric(10,2)', notNull: true },
    method: { type: 'payment_method', notNull: true },
    // When the money was actually received (front desk can backdate); defaults now.
    paid_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    notes: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  // A payment is money in — it must be positive.
  pgm.addConstraint('payments', 'payments_amount_positive', { check: 'amount > 0' });

  // Profile history is per-member; per-subscription lookups + date sorting.
  pgm.createIndex('payments', 'member_id');
  pgm.createIndex('payments', 'subscription_id');
  pgm.createIndex('payments', 'paid_at');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('payments');
  pgm.dropType('payment_method');
};
