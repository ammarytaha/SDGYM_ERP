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
const { insertPayment } = require('./payments.controller');

// Subscription columns + the plan's display fields + derived flags. Dates are
// returned as plain 'YYYY-MM-DD' text so they aren't shifted a day by JSON's UTC
// serialization of pg DATE values. Phase 3b adds installment fields: the agreed
// total (snapshot, falling back to the plan price for old rows), how much has been
// paid, the remaining balance, and whether it's paid in full. Phase 2 has no
// auto-expiry job yet — that's the Phase 5 cron — so the UI reads is_expired here.
const SUBSCRIPTION_SELECT = `
  s.id, s.member_id, s.plan_id,
  to_char(s.start_date, 'YYYY-MM-DD') AS start_date,
  to_char(s.end_date, 'YYYY-MM-DD') AS end_date,
  s.status,
  to_char(s.frozen_from, 'YYYY-MM-DD') AS frozen_from,
  to_char(s.frozen_until, 'YYYY-MM-DD') AS frozen_until,
  s.created_at,
  p.name AS plan_name, p.duration_days AS plan_duration_days, p.price AS plan_price,
  COALESCE(s.agreed_total, p.price) AS agreed_total,
  COALESCE(pp.paid, 0) AS amount_paid,
  (COALESCE(s.agreed_total, p.price) - COALESCE(pp.paid, 0)) AS balance,
  (COALESCE(pp.paid, 0) >= COALESCE(s.agreed_total, p.price)) AS is_paid,
  (s.status = 'active' AND s.end_date < current_date) AS is_expired
`;

// Shared FROM: the plan (for name/price) + a per-subscription payment-sum subquery
// (for the installment math). Reused by every subscription read.
const SUBSCRIPTION_FROM = `
  FROM subscriptions s
  JOIN membership_plans p ON p.id = s.plan_id
  LEFT JOIN (
    SELECT subscription_id, SUM(amount) AS paid
    FROM payments
    GROUP BY subscription_id
  ) pp ON pp.subscription_id = s.id
`;

// Fetch one subscription joined with its plan + payment sums. `q(text, params)` is
// either the pooled `query` or a transaction client's query, so this works in both.
async function fetchSubscription(q, id) {
  const result = await q(
    `SELECT ${SUBSCRIPTION_SELECT} ${SUBSCRIPTION_FROM} WHERE s.id = $1`,
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
    `SELECT ${SUBSCRIPTION_SELECT} ${SUBSCRIPTION_FROM}
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
  const { member_id, plan_id, start_date, agreed_total, payment } = req.valid.body;

  const subscription = await withTransaction(async (client) => {
    const q = (text, params) => client.query(text, params);

    // Lock the member row so a concurrent status change can't interleave.
    const memberRes = await q('SELECT id FROM members WHERE id = $1 FOR UPDATE', [member_id]);
    if (!memberRes.rows[0]) throw new AppError('Member not found.', 404, 'MEMBER_NOT_FOUND');

    const planRes = await q(
      'SELECT id, duration_days, price, active FROM membership_plans WHERE id = $1',
      [plan_id]
    );
    const plan = planRes.rows[0];
    if (!plan) throw new AppError('Plan not found.', 404, 'PLAN_NOT_FOUND');
    if (!plan.active) {
      throw new AppError('This plan is retired and cannot be used.', 409, 'PLAN_INACTIVE');
    }

    // The agreed total defaults to the plan price but can be discounted (Phase 3b).
    const total = agreed_total ?? plan.price;

    // start_date defaults to today; end_date = start_date + duration (date + int).
    const insertRes = await q(
      `INSERT INTO subscriptions (member_id, plan_id, start_date, end_date, status, agreed_total)
       VALUES (
         $1, $2,
         COALESCE($3::date, current_date),
         COALESCE($3::date, current_date) + $4::int,
         'active',
         $5
       )
       RETURNING id`,
      [member_id, plan_id, start_date ?? null, plan.duration_days, total]
    );
    const newId = insertRes.rows[0].id;

    // Sync the member's overall status to reflect the new active subscription.
    await q(`UPDATE members SET status = 'active' WHERE id = $1`, [member_id]);

    // Optional opening payment — recorded in the SAME transaction, so the
    // subscription is never left without the payment it was created with. If the
    // payment insert throws (e.g. a DB constraint), the whole subscription rolls
    // back too.
    if (payment) {
      await insertPayment(q, { member_id, subscription_id: newId, ...payment });
    }

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

// Attention lists join the member (name + phone) so the front desk can act — call
// them to renew or collect. Same payment-sum subquery as the balance math above.
const ATTENTION_SELECT = `
  s.id AS subscription_id, s.member_id,
  m.full_name AS member_name, m.phone,
  p.name AS plan_name,
  to_char(s.end_date, 'YYYY-MM-DD') AS end_date,
  (s.end_date - current_date) AS days_left,
  (s.status = 'active' AND s.end_date < current_date) AS is_expired,
  COALESCE(s.agreed_total, p.price) AS agreed_total,
  COALESCE(pp.paid, 0) AS amount_paid,
  (COALESCE(s.agreed_total, p.price) - COALESCE(pp.paid, 0)) AS balance
`;
const ATTENTION_FROM = `
  FROM subscriptions s
  JOIN members m ON m.id = s.member_id
  JOIN membership_plans p ON p.id = s.plan_id
  LEFT JOIN (
    SELECT subscription_id, SUM(amount) AS paid
    FROM payments
    GROUP BY subscription_id
  ) pp ON pp.subscription_id = s.id
`;

/**
 * GET /api/subscriptions/attention?within=7 (owner, front_desk)
 * The front desk's daily follow-up list, in-app (WhatsApp reminders are Phase 5):
 *   - renewals: active subscriptions ending within `within` days (or already past)
 *   - dues:     current subscriptions (active/frozen) not yet paid in full
 */
async function listAttention(req, res) {
  const { within } = req.valid.query;

  const renewals = await query(
    `SELECT ${ATTENTION_SELECT} ${ATTENTION_FROM}
     WHERE s.status = 'active' AND s.end_date <= current_date + $1::int
     ORDER BY s.end_date ASC, s.id ASC`,
    [within]
  );

  const dues = await query(
    `SELECT ${ATTENTION_SELECT} ${ATTENTION_FROM}
     WHERE s.status IN ('active', 'frozen')
       AND (COALESCE(s.agreed_total, p.price) - COALESCE(pp.paid, 0)) > 0
     ORDER BY (COALESCE(s.agreed_total, p.price) - COALESCE(pp.paid, 0)) DESC, s.id ASC`
  );

  return ok(res, { renewals: renewals.rows, dues: dues.rows });
}

module.exports = {
  listMemberSubscriptions,
  createSubscription,
  patchSubscription,
  listAttention,
};
