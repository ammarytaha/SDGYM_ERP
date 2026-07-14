'use strict';

// Daily reminder job (spec §5). Run once and exit — schedule it with your OS:
//   npm run reminders
//   cron:  0 9 * * *  cd /path/to/backend && npm run reminders
// Sends renewal reminders (subs ending within 3 days) and payment-overdue reminders
// (members with an outstanding balance), each deduped to once per day. With no Meta
// credentials it runs in DRY-RUN mode (logs to notifications_log, no messages sent).

const { pool } = require('../src/config/db');
const { runReminders } = require('../src/services/reminders');
const config = require('../src/config/env');

(async () => {
  const mode = config.whatsapp.enabled ? 'LIVE (Meta Cloud API)' : 'DRY-RUN (no Meta creds — logging only)';
  console.log(`\n[reminders] running in ${mode}…\n`);
  try {
    const s = await runReminders();
    console.log(`  renewal_reminder sent : ${s.renewals}`);
    console.log(`  payment_overdue sent  : ${s.overdue}`);
    console.log(`  skipped (already today): ${s.skipped}`);
    console.log(`  failed                 : ${s.failed}`);
    console.log('\n[reminders] done.\n');
  } catch (err) {
    console.error('[reminders] run failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
