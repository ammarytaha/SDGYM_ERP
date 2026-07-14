'use strict';

// Daily reminder run (spec §5). Two passes, both deduped to once/day/member:
//   - renewal_reminder: active subscriptions ending within the next 3 days
//   - payment_overdue:  current subscriptions with an outstanding balance (Phase 3b)
// Invoked by scripts/send-reminders.js (schedule with cron / Task Scheduler) and by
// the smoke test directly. In dry-run (no Meta creds) it still writes the log rows.

const { query } = require('../config/db');
const { alreadySentToday, notifyRenewal, notifyOverdue } = require('./notifications');

async function runReminders() {
  const summary = { renewals: 0, overdue: 0, skipped: 0, failed: 0 };

  // ---- Renewals due within 3 days ----
  const renewals = await query(
    `SELECT s.member_id, m.full_name, m.phone,
            to_char(s.end_date, 'YYYY-MM-DD') AS end_date
     FROM subscriptions s
     JOIN members m ON m.id = s.member_id
     WHERE s.status = 'active'
       AND s.end_date BETWEEN current_date AND current_date + 3
     ORDER BY s.end_date ASC, s.member_id ASC`
  );
  for (const row of renewals.rows) {
    if (await alreadySentToday(row.member_id, 'renewal_reminder')) {
      summary.skipped += 1;
      continue;
    }
    const member = { id: row.member_id, full_name: row.full_name, phone: row.phone };
    const { status } = await notifyRenewal(member, row.end_date);
    status === 'sent' ? (summary.renewals += 1) : (summary.failed += 1);
  }

  // ---- Outstanding balances (Phase 3b dues query) ----
  const overdue = await query(
    `SELECT s.member_id, m.full_name, m.phone,
            (COALESCE(s.agreed_total, p.price) - COALESCE(pp.paid, 0)) AS balance
     FROM subscriptions s
     JOIN members m ON m.id = s.member_id
     JOIN membership_plans p ON p.id = s.plan_id
     LEFT JOIN (
       SELECT subscription_id, SUM(amount) AS paid FROM payments GROUP BY subscription_id
     ) pp ON pp.subscription_id = s.id
     WHERE s.status IN ('active', 'frozen')
       AND (COALESCE(s.agreed_total, p.price) - COALESCE(pp.paid, 0)) > 0
     ORDER BY balance DESC, s.member_id ASC`
  );
  for (const row of overdue.rows) {
    if (await alreadySentToday(row.member_id, 'payment_overdue')) {
      summary.skipped += 1;
      continue;
    }
    const member = { id: row.member_id, full_name: row.full_name, phone: row.phone };
    const { status } = await notifyOverdue(member, row.balance);
    status === 'sent' ? (summary.overdue += 1) : (summary.failed += 1);
  }

  return summary;
}

module.exports = { runReminders };
