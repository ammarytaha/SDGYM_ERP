'use strict';

// Notifications log reads (spec §6/§7 #7). The front desk uses this to see what
// WhatsApp messages went out (and whether they failed). Read-only for all roles;
// rows are written as side effects of other actions + the daily reminder job.

const { query } = require('../config/db');
const { ok } = require('../utils/apiResponse');

/** GET /api/notifications/log?member_id= — newest first (capped for the global view). */
async function listNotificationsLog(req, res) {
  const { member_id } = req.valid.query;

  const params = [];
  let where = '';
  if (member_id) {
    params.push(member_id);
    where = `WHERE n.member_id = $${params.length}`;
  }

  const result = await query(
    `SELECT n.id, n.member_id, m.full_name AS member_name,
            n.type, n.status, n.sent_at, n.payload
     FROM notifications_log n
     JOIN members m ON m.id = n.member_id
     ${where}
     ORDER BY n.sent_at DESC, n.id DESC
     LIMIT 200`,
    params
  );
  return ok(res, { notifications: result.rows });
}

module.exports = { listNotificationsLog };
