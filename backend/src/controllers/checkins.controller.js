'use strict';

// Check-ins (spec §4/§5). The kiosk POSTs either a scanned qr_code_token or, as a
// manual override, a member_id. We resolve the member, judge access from their
// CURRENT subscription (active + not past end_date), log the scan with its result
// (allowed/denied), and hand the kiosk everything it needs to show the member and
// a clear allowed/denied outcome. Access is read from the subscription rather than
// members.status because there's no auto-expiry cron yet (Phase 5) — end_date is
// the source of truth. WhatsApp confirmation on an allowed entry is Phase 5.

const { query } = require('../config/db');
const AppError = require('../utils/AppError');
const { ok } = require('../utils/apiResponse');
const { notifyCheckin } = require('../services/notifications');

/**
 * Decide whether a member may enter today, from their most current subscription.
 * @returns {{ allowed: boolean, reason: string|null }}
 *   reason (when denied): 'frozen' | 'expired' | 'no_subscription'
 */
async function evaluateAccess(memberId) {
  const res = await query(
    `SELECT status, (end_date >= current_date) AS not_expired
     FROM subscriptions
     WHERE member_id = $1 AND status IN ('active', 'frozen')
     ORDER BY end_date DESC
     LIMIT 1`,
    [memberId]
  );
  const sub = res.rows[0];
  if (!sub) return { allowed: false, reason: 'no_subscription' };
  if (sub.status === 'frozen') return { allowed: false, reason: 'frozen' };
  if (sub.status === 'active' && sub.not_expired) return { allowed: true, reason: null };
  return { allowed: false, reason: 'expired' }; // active but past end_date
}

/**
 * POST /api/checkins (owner, front_desk)
 * Body: { qr_code_token } (QR scan) OR { member_id } (manual override) — exactly one.
 * Always 201: a denied scan is a logged outcome, not an HTTP error. Genuine errors
 * (unknown token / missing member) are 404.
 */
async function createCheckin(req, res) {
  const { qr_code_token, member_id } = req.valid.body;

  let member;
  let method;
  if (qr_code_token) {
    const r = await query(
      'SELECT id, full_name, phone, photo_url, status FROM members WHERE qr_code_token = $1',
      [qr_code_token]
    );
    member = r.rows[0];
    if (!member) throw new AppError('Unknown QR code.', 404, 'UNKNOWN_QR');
    method = 'qr';
  } else {
    const r = await query(
      'SELECT id, full_name, phone, photo_url, status FROM members WHERE id = $1',
      [member_id]
    );
    member = r.rows[0];
    if (!member) throw new AppError('Member not found.', 404, 'MEMBER_NOT_FOUND');
    method = 'manual';
  }

  const { allowed, reason } = await evaluateAccess(member.id);
  const result = allowed ? 'allowed' : 'denied';

  // Whether they already have a successful entry today (informational only).
  let alreadyToday = false;
  if (allowed) {
    const dup = await query(
      `SELECT 1 FROM checkins
       WHERE member_id = $1 AND result = 'allowed' AND checked_in_at::date = current_date
       LIMIT 1`,
      [member.id]
    );
    alreadyToday = dup.rows.length > 0;
  }

  const ins = await query(
    `INSERT INTO checkins (member_id, method, result)
     VALUES ($1, $2, $3)
     RETURNING id, checked_in_at, method, result`,
    [member.id, method, result]
  );

  // WhatsApp confirmation on a successful entry (spec §5). Swallowed — a messaging
  // problem must never fail the check-in.
  if (allowed) {
    await notifyCheckin(member);
  }

  return ok(
    res,
    {
      result,
      reason,
      already_today: alreadyToday,
      member: {
        id: member.id,
        full_name: member.full_name,
        photo_url: member.photo_url,
        status: member.status,
      },
      checkin: ins.rows[0],
    },
    201
  );
}

/**
 * GET /api/checkins?date=YYYY-MM-DD&member_id= (all roles — trainer read-only)
 * Attendance log, newest first, optionally filtered by day and/or member.
 */
async function listCheckins(req, res) {
  const { date, member_id } = req.valid.query;

  const conditions = [];
  const params = [];
  if (date) {
    params.push(date);
    conditions.push(`c.checked_in_at::date = $${params.length}::date`);
  }
  if (member_id) {
    params.push(member_id);
    conditions.push(`c.member_id = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query(
    `SELECT c.id, c.member_id, m.full_name AS member_name,
            c.method, c.result, c.checked_in_at
     FROM checkins c
     JOIN members m ON m.id = c.member_id
     ${where}
     ORDER BY c.checked_in_at DESC, c.id DESC`,
    params
  );

  return ok(res, { checkins: result.rows });
}

module.exports = { createCheckin, listCheckins };
