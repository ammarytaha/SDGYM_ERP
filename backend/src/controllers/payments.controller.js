'use strict';

// Payments (spec §4/§6). Manual cash/card entries, always tied to the
// subscription they paid for. Writes are owner+front_desk (enforced on the
// route); reads are open to all roles (trainer is read-only). There is no edit
// or delete endpoint in the MVP — spec §6 says the front desk cannot edit a
// payment amount after creation, which we satisfy by not offering edits at all;
// corrections are recorded as a new payment.

const { query } = require('../config/db');
const AppError = require('../utils/AppError');
const { ok } = require('../utils/apiResponse');

// Payment fields + a plain 'YYYY-MM-DD' paid_date (so the UI shows the right day
// without the pg-DATE/UTC shift) + the plan name for context. `pay` avoids the
// reserved-word ambiguity of `p` (already used for plans in joins).
const PAYMENT_SELECT = `
  pay.id, pay.member_id, pay.subscription_id,
  pay.amount, pay.method,
  to_char(pay.paid_at, 'YYYY-MM-DD') AS paid_date,
  pay.paid_at,
  pay.notes, pay.created_at,
  p.name AS plan_name
`;

const PAYMENT_FROM = `
  FROM payments pay
  JOIN subscriptions s ON s.id = pay.subscription_id
  JOIN membership_plans p ON p.id = s.plan_id
`;

/**
 * Insert one payment. `q` is either the pooled `query` or a transaction client's
 * query, so this is reused by both the standalone POST /payments and the atomic
 * subscribe-and-pay path (inside the subscription transaction).
 * @returns {Promise<number>} the new payment id
 */
async function insertPayment(q, { member_id, subscription_id, amount, method, paid_at, notes }) {
  const res = await q(
    `INSERT INTO payments (member_id, subscription_id, amount, method, paid_at, notes)
     VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()), $6)
     RETURNING id`,
    [member_id, subscription_id, amount, method, paid_at ?? null, notes ?? null]
  );
  return res.rows[0].id;
}

/** Fetch one payment joined with its subscription's plan. Works with pool or txn. */
async function fetchPayment(q, id) {
  const res = await q(`SELECT ${PAYMENT_SELECT} ${PAYMENT_FROM} WHERE pay.id = $1`, [id]);
  return res.rows[0];
}

/** GET /api/members/:id/payments — a member's payment history (all roles). */
async function listMemberPayments(req, res) {
  const { id } = req.valid.params; // member id

  const member = await query('SELECT id FROM members WHERE id = $1', [id]);
  if (!member.rows[0]) throw new AppError('Member not found.', 404, 'MEMBER_NOT_FOUND');

  const result = await query(
    `SELECT ${PAYMENT_SELECT} ${PAYMENT_FROM}
     WHERE pay.member_id = $1
     ORDER BY pay.paid_at DESC, pay.id DESC`,
    [id]
  );
  return ok(res, { payments: result.rows });
}

/**
 * POST /api/payments (owner, front_desk) — record a standalone payment against
 * an existing subscription (e.g. an installment or late cash). The subscribe
 * screen records the opening payment atomically instead (see createSubscription).
 */
async function createPayment(req, res) {
  const { member_id, subscription_id, amount, method, paid_at, notes } = req.valid.body;

  const member = await query('SELECT id FROM members WHERE id = $1', [member_id]);
  if (!member.rows[0]) throw new AppError('Member not found.', 404, 'MEMBER_NOT_FOUND');

  // The subscription must exist AND belong to this member.
  const sub = await query(
    'SELECT id FROM subscriptions WHERE id = $1 AND member_id = $2',
    [subscription_id, member_id]
  );
  if (!sub.rows[0]) {
    throw new AppError('Subscription not found for this member.', 404, 'SUBSCRIPTION_NOT_FOUND');
  }

  const newId = await insertPayment(query, {
    member_id,
    subscription_id,
    amount,
    method,
    paid_at,
    notes,
  });
  const payment = await fetchPayment(query, newId);
  return ok(res, { payment }, 201);
}

module.exports = {
  insertPayment,
  listMemberPayments,
  createPayment,
};
