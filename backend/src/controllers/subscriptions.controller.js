'use strict';

// Subscriptions (spec §4/§5). A subscription is a member's enrolment in a plan
// for a date range. Two business rules drive this module:
//   1. Freezing pauses the clock — on unfreeze, end_date is pushed out by the
//      number of days the subscription was frozen (so paid time isn't lost).
//   2. members.status is kept in sync with the current subscription state, in
//      the SAME transaction as the subscription change (atomic, no drift).
// All date math is done in Postgres (date ± int = date) so it matches the DB's
// notion of "today" rather than the Node process's timezone.

const { query, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { ok } = require('../utils/apiResponse');

// Subscription columns + the plan's display fields + a derived is_expired flag
// (Phase 2 has no auto-expiry job yet — that's the Phase 5 cron — so the UI
// reads this instead). Dates are returned as plain 'YYYY-MM-DD' text so they
// aren't shifted a day by JSON's UTC serialization of pg DATE values.
const SUBSCRIPTION_SELECT = `
  s.id, s.member_id, s.plan_id,
  to_char(s.start_date, 'YYYY-MM-DD') AS start_date,
  to_char(s.end_date, 'YYYY-MM-DD') AS end_date,
  s.status,
  to_char(s.frozen_from, 'YYYY-MM-DD') AS frozen_from,
  to_char(s.frozen_until, 'YYYY-MM-DD') AS frozen_until,
  s.created_at,
  p.name AS plan_name, p.duration_days AS plan_duration_days, p.price AS plan_price,
  (s.status = 'active' AND s.end_date < current_date) AS is_expired
`;

// Fetch one subscription joined with its plan. `q(text, params)` is either the
// pooled `query` or a transaction client's query, so this works in both.
async function fetchSubscription(q, id) {
  const result = await q(
    `SELECT ${SUBSCRIPTION_SELECT}
     FROM subscriptions s
     JOIN membership_plans p ON p.id = s.plan_id
     WHERE s.id = $1`,
    [id]
  );
  return result.rows[0];
}

/** GET /api/members/:id/subscriptions — a member's subscription history. */
async function listMemberSubscriptions(req, res) {
  const { id } = req.valid.params; // member id

  const member = await query('SELECT id FROM members WHERE id = $1', [id]);
  if (!member.rows[0]) throw new AppError('Member not found.', 404, 'MEMBER_NOT_FOUND');

  const result = await query(
    `SELECT ${SUBSCRIPTION_SELECT}
     FROM subscriptions s
     JOIN membership_plans p ON p.id = s.plan_id
     WHERE s.member_id = $1
     ORDER BY s.start_date DESC, s.id DESC`,
    [id]
  );
  return ok(res, { subscriptions: result.rows });
}

/**
 * POST /api/subscriptions (owner, front_desk)
 * Creates a subscription (also how "renew" works — just a later start_date) and
 * marks the member active, atomically.
 */
async function createSubscription(req, res) {
  const { member_id, plan_id, start_date } = req.valid.body;

  const subscription = await withTransaction(async (client) => {
    const q = (text, params) => client.query(text, params);

    // Lock the member row so a concurrent status change can't interleave.
    const memberRes = await q('SELECT id FROM members WHERE id = $1 FOR UPDATE', [member_id]);
    if (!memberRes.rows[0]) throw new AppError('Member not found.', 404, 'MEMBER_NOT_FOUND');

    const planRes = await q(
      'SELECT id, duration_days, active FROM membership_plans WHERE id = $1',
      [plan_id]
    );
    const plan = planRes.rows[0];
    if (!plan) throw new AppError('Plan not found.', 404, 'PLAN_NOT_FOUND');
    if (!plan.active) {
      throw new AppError('This plan is retired and cannot be used.', 409, 'PLAN_INACTIVE');
    }

    // start_date defaults to today; end_date = start_date + duration (date + int).
    const insertRes = await q(
      `INSERT INTO subscriptions (member_id, plan_id, start_date, end_date, status)
       VALUES (
         $1, $2,
         COALESCE($3::date, current_date),
         COALESCE($3::date, current_date) + $4::int,
         'active'
       )
       RETURNING id`,
      [member_id, plan_id, start_date ?? null, plan.duration_days]
    );
    const newId = insertRes.rows[0].id;

    // Sync the member's overall status to reflect the new active subscription.
    await q(`UPDATE members SET status = 'active' WHERE id = $1`, [member_id]);

    return fetchSubscription(q, newId);
  });

  return ok(res, { subscription }, 201);
}

/**
 * PATCH /api/subscriptions/:id (owner, front_desk)
 * State machine: freeze | unfreeze | cancel. Each transition also syncs
 * members.status. Invalid transitions -> 409 INVALID_TRANSITION.
 */
async function patchSubscription(req, res) {
  const { id } = req.valid.params;
  const { action, frozen_until } = req.valid.body;

  const subscription = await withTransaction(async (client) => {
    const q = (text, params) => client.query(text, params);

    const cur = await q('SELECT id, member_id, status FROM subscriptions WHERE id = $1 FOR UPDATE', [id]);
    const sub = cur.rows[0];
    if (!sub) throw new AppError('Subscription not found.', 404, 'SUBSCRIPTION_NOT_FOUND');

    if (action === 'freeze') {
      if (sub.status !== 'active') {
        throw new AppError('Only an active subscription can be frozen.', 409, 'INVALID_TRANSITION');
      }
      await q(
        `UPDATE subscriptions
         SET status = 'frozen', frozen_from = current_date, frozen_until = $2::date
         WHERE id = $1`,
        [id, frozen_until ?? null]
      );
      await q(`UPDATE members SET status = 'frozen' WHERE id = $1`, [sub.member_id]);
    } else if (action === 'unfreeze') {
      if (sub.status !== 'frozen') {
        throw new AppError('Only a frozen subscription can be unfrozen.', 409, 'INVALID_TRANSITION');
      }
      // Pause the clock: add the frozen days back onto end_date.
      await q(
        `UPDATE subscriptions
         SET end_date = end_date + GREATEST(current_date - frozen_from, 0),
             status = 'active',
             frozen_until = current_date
         WHERE id = $1`,
        [id]
      );
      await q(`UPDATE members SET status = 'active' WHERE id = $1`, [sub.member_id]);
    } else {
      // action === 'cancel'
      if (sub.status === 'cancelled') {
        throw new AppError('Subscription is already cancelled.', 409, 'INVALID_TRANSITION');
      }
      await q(`UPDATE subscriptions SET status = 'cancelled' WHERE id = $1`, [id]);
      await q(`UPDATE members SET status = 'cancelled' WHERE id = $1`, [sub.member_id]);
    }

    return fetchSubscription(q, id);
  });

  return ok(res, { subscription });
}

module.exports = {
  listMemberSubscriptions,
  createSubscription,
  patchSubscription,
};
