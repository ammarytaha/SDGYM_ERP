'use strict';

// Phase 3b: installments. A subscription can be paid in parts, so we need to know
// the TOTAL a member agreed to pay for it — snapshotted here rather than derived
// from the plan's current price (which can change, and which can't express a
// discount). Balance = agreed_total - sum(payments). Nullable + backfilled: old
// rows and any that omit it fall back to the plan price at read time via COALESCE.

exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.addColumn('subscriptions', {
    // The agreed price for this subscription. Defaults to the plan price on create
    // (set by the controller); editable for discounts. 0 = comped membership.
    agreed_total: { type: 'numeric(10,2)' },
  });

  // Backfill existing subscriptions with their plan's current price.
  pgm.sql(`
    UPDATE subscriptions s
    SET agreed_total = p.price
    FROM membership_plans p
    WHERE p.id = s.plan_id AND s.agreed_total IS NULL
  `);

  pgm.addConstraint('subscriptions', 'subscriptions_agreed_total_nonneg', {
    check: 'agreed_total >= 0',
  });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropConstraint('subscriptions', 'subscriptions_agreed_total_nonneg');
  pgm.dropColumn('subscriptions', 'agreed_total');
};
