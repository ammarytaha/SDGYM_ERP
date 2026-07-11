'use strict';

// Demo seed for membership plans (Phase 2). Gives the plan-picker and pricing
// something real to show. Safe to re-run — existing plan names are skipped
// (ON CONFLICT (name) DO NOTHING).
//
//   npm run seed:plans
//
// Requires: Postgres running and migrations applied (npm run migrate:up).

const { pool, query } = require('../src/config/db');

// Prices in EGP. Durations chosen so the picker demonstrates short/medium/long.
const SAMPLE_PLANS = [
  { name: 'شهري', duration_days: 30, price: 300 },
  { name: 'ربع سنوي', duration_days: 90, price: 800 },
  { name: 'سنوي', duration_days: 365, price: 2800 },
];

(async () => {
  let inserted = 0;
  try {
    for (const p of SAMPLE_PLANS) {
      const res = await query(
        `INSERT INTO membership_plans (name, duration_days, price)
         VALUES ($1, $2, $3)
         ON CONFLICT (name) DO NOTHING
         RETURNING id`,
        [p.name, p.duration_days, p.price]
      );
      if (res.rowCount > 0) inserted += 1;
    }
    const total = await query('SELECT count(*)::int AS n FROM membership_plans');
    console.log(
      `✅ Seeded ${inserted} new plan(s) (skipped ${SAMPLE_PLANS.length - inserted} existing). ` +
        `Plans table now holds ${total.rows[0].n} row(s).`
    );
  } catch (err) {
    console.error(`❌ Seed failed: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
