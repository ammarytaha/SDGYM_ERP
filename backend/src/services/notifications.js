'use strict';

// Notification orchestration (spec §5/§8). Ties an event (welcome, check-in,
// renewal, overdue) to a WhatsApp template send AND an audit row in
// notifications_log — recording success/failure and the exact template + params,
// whether it hit Meta or was dry-run. `notify()` NEVER throws, so a messaging
// problem can never break the action that triggered it (a subscription, a scan).
//
// Template names sent to Meta = the notification type. The member creates matching
// templates in Meta with body variables in this param order:
//   welcome              -> {{1}} = full_name
//   checkin_confirmation -> {{1}} = full_name
//   renewal_reminder     -> {{1}} = full_name, {{2}} = end_date
//   payment_overdue      -> {{1}} = full_name, {{2}} = balance

const { query } = require('../config/db');
const { toE164, sendTemplate } = require('./whatsapp');

/** Insert one audit row. `payload` (object) is stored as jsonb. */
async function logNotification(memberId, type, status, payload) {
  const res = await query(
    `INSERT INTO notifications_log (member_id, type, status, payload)
     VALUES ($1, $2, $3, $4)
     RETURNING id, sent_at`,
    [memberId, type, status, payload ? JSON.stringify(payload) : null]
  );
  return res.rows[0];
}

/** True if a notification of this type was already logged for the member today. */
async function alreadySentToday(memberId, type) {
  const res = await query(
    `SELECT 1 FROM notifications_log
     WHERE member_id = $1 AND type = $2 AND sent_at::date = current_date
     LIMIT 1`,
    [memberId, type]
  );
  return res.rows.length > 0;
}

/**
 * Send a templated WhatsApp message and log the outcome. Never throws.
 * @param {{ id:number, full_name:string, phone:string }} member
 * @param {string} type notification_type (also the Meta template name)
 * @param {Array} params template body params (positional)
 */
async function notify(member, type, params = []) {
  const to = toE164(member.phone);
  let status = 'sent';
  const payload = { template: type, params, to };

  try {
    const result = await sendTemplate({ to, templateName: type, params });
    if (result.skipped) payload.dry_run = true;
    else payload.response = result.response;
  } catch (err) {
    status = 'failed';
    payload.error = err.message;
    if (err.response) payload.error_response = err.response;
  }

  try {
    await logNotification(member.id, type, status, payload);
  } catch (logErr) {
    // Last resort — logging must never break the caller.
    // eslint-disable-next-line no-console
    console.error('[notifications] failed to write log row:', logErr.message);
  }
  return { status, payload };
}

const notifyWelcome = (member) => notify(member, 'welcome', [member.full_name]);
const notifyCheckin = (member) => notify(member, 'checkin_confirmation', [member.full_name]);
const notifyRenewal = (member, endDate) =>
  notify(member, 'renewal_reminder', [member.full_name, endDate]);
const notifyOverdue = (member, balance) =>
  notify(member, 'payment_overdue', [member.full_name, String(balance)]);

module.exports = {
  logNotification,
  alreadySentToday,
  notify,
  notifyWelcome,
  notifyCheckin,
  notifyRenewal,
  notifyOverdue,
};
