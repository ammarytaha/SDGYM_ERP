'use strict';

// Phase 5 smoke test for WhatsApp notifications. Self-contained, runs in DRY-RUN
// (no Meta creds), so it exercises the whole pipeline without sending anything:
//   npm run smoke:notifications
// Checks toE164, the welcome + check-in triggers (and that they DON'T fire when
// they shouldn't), the daily reminder run (renewal + overdue) with per-day dedup,
// and the log read endpoint. Cleans up after itself (including any reminder rows it
// wrote for pre-existing demo members).
//
// Requires: Postgres running and migrations applied (npm run migrate:up).

const assert = require('node:assert/strict');
const app = require('../src/app');
const { pool, query } = require('../src/config/db');
const { signToken } = require('../src/utils/jwt');
const { toE164 } = require('../src/services/whatsapp');
const { runReminders } = require('../src/services/reminders');

let passed = 0;
function check(name, condition) {
  assert.ok(condition, name);
  console.log(`  ✓ ${name}`);
  passed += 1;
}

async function req(base, method, path, token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function seedUser(role) {
  const email = `smoke_${role}_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.test`;
  const ins = await query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING id`,
    [`Smoke ${role}`, email, 'x-not-used', role]
  );
  return { id: ins.rows[0].id, email, token: signToken({ id: ins.rows[0].id, role, email }) };
}

async function seedMember(label) {
  const phone = `0100${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 10)}`;
  const res = await query(
    `INSERT INTO members (full_name, phone, status, qr_code_token)
     VALUES ($1,$2,'active',$3) RETURNING id`,
    [label, phone, `tok_${Date.now()}_${Math.floor(Math.random() * 1e9)}`]
  );
  return { id: res.rows[0].id, phone };
}

async function seedSub(memberId, planId, { endOffset = 30, status = 'active', agreedTotal = 0 }) {
  const res = await query(
    `INSERT INTO subscriptions (member_id, plan_id, start_date, end_date, status, agreed_total)
     VALUES ($1,$2,current_date, current_date + $3::int, $4, $5) RETURNING id`,
    [memberId, planId, endOffset, status, agreedTotal]
  );
  return res.rows[0].id;
}

const countLog = async (memberId, type) => {
  const r = await query(
    `SELECT count(*)::int AS n FROM notifications_log WHERE member_id = $1 AND type = $2`,
    [memberId, type]
  );
  return r.rows[0].n;
};

(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const createdUserIds = [];
  const memberIds = [];
  let planId;
  // Remember the log high-water mark so we can clean up rows the reminder run
  // writes for pre-existing demo members (seeded members clean up via cascade).
  const beforeMax = (await query('SELECT COALESCE(max(id),0) AS m FROM notifications_log')).rows[0].m;

  console.log(`\nRunning Phase 5 notifications smoke test (dry-run) against ${base}\n`);

  try {
    const owner = await seedUser('owner');
    const trainer = await seedUser('trainer');
    createdUserIds.push(owner.id, trainer.id);

    const planRes = await query(
      `INSERT INTO membership_plans (name, duration_days, price, active)
       VALUES ($1, 30, 300, true) RETURNING id`,
      [`Smoke Notif Plan ${Date.now()}`]
    );
    planId = planRes.rows[0].id;

    // ---- toE164 ----
    check('toE164 leading-zero -> 20…', toE164('01055500999') === '201055500999');
    check('toE164 already-E164 unchanged', toE164('201055500999') === '201055500999');
    check('toE164 bare 10-digit -> 20…', toE164('1055500999') === '201055500999');

    // ---- Welcome trigger ----
    const mWelcome = await seedMember('عضو الترحيب');
    memberIds.push(mWelcome.id);
    let r = await req(base, 'POST', '/api/subscriptions', owner.token, { member_id: mWelcome.id, plan_id: planId, agreed_total: 0 });
    check('first subscription -> 201', r.status === 201);
    check('welcome logged on first subscription', (await countLog(mWelcome.id, 'welcome')) === 1);

    const welcomeRow = (await query(`SELECT status, payload FROM notifications_log WHERE member_id=$1 AND type='welcome'`, [mWelcome.id])).rows[0];
    check('welcome row status = sent (dry-run)', welcomeRow.status === 'sent');
    check('welcome payload marks dry_run', welcomeRow.payload && welcomeRow.payload.dry_run === true);

    r = await req(base, 'POST', '/api/subscriptions', owner.token, { member_id: mWelcome.id, plan_id: planId, agreed_total: 0 });
    check('second subscription -> 201', r.status === 201);
    check('no second welcome (only first subscription)', (await countLog(mWelcome.id, 'welcome')) === 1);

    // ---- Check-in confirmation trigger ----
    const mCheckin = await seedMember('عضو الحضور');
    memberIds.push(mCheckin.id);
    await seedSub(mCheckin.id, planId, { endOffset: 30, agreedTotal: 0 });
    r = await req(base, 'POST', '/api/checkins', owner.token, { member_id: mCheckin.id });
    check('allowed check-in -> 201 allowed', r.status === 201 && r.body.data.result === 'allowed');
    check('checkin_confirmation logged on allowed entry', (await countLog(mCheckin.id, 'checkin_confirmation')) === 1);

    const mDenied = await seedMember('عضو مرفوض'); // no subscription
    memberIds.push(mDenied.id);
    r = await req(base, 'POST', '/api/checkins', owner.token, { member_id: mDenied.id });
    check('denied check-in -> denied', r.status === 201 && r.body.data.result === 'denied');
    check('no confirmation on a denied entry', (await countLog(mDenied.id, 'checkin_confirmation')) === 0);

    // ---- Daily reminders ----
    const mRenewal = await seedMember('عضو تجديد'); // ends in 2 days, fully paid
    const mOverdue = await seedMember('عضو مديونية'); // ends far, owes 300
    memberIds.push(mRenewal.id, mOverdue.id);
    await seedSub(mRenewal.id, planId, { endOffset: 2, agreedTotal: 0 });
    await seedSub(mOverdue.id, planId, { endOffset: 30, agreedTotal: 300 }); // no payment -> balance 300

    const summary = await runReminders();
    check('reminders summary counts renewals + overdue', summary.renewals >= 1 && summary.overdue >= 1);
    check('renewal_reminder logged for the expiring member', (await countLog(mRenewal.id, 'renewal_reminder')) === 1);
    check('payment_overdue logged for the indebted member', (await countLog(mOverdue.id, 'payment_overdue')) === 1);

    // ---- Dedup: a second run the same day sends nothing new ----
    const summary2 = await runReminders();
    check('second run skips already-sent members', summary2.skipped >= 2 && summary2.renewals === 0 && summary2.overdue === 0);
    check('no duplicate renewal_reminder', (await countLog(mRenewal.id, 'renewal_reminder')) === 1);
    check('no duplicate payment_overdue', (await countLog(mOverdue.id, 'payment_overdue')) === 1);

    // ---- Log read endpoint ----
    r = await req(base, 'GET', `/api/notifications/log?member_id=${mWelcome.id}`, owner.token);
    check('GET /notifications/log?member_id -> welcome row', r.status === 200 && r.body.data.notifications.some((n) => n.type === 'welcome'));

    r = await req(base, 'GET', '/api/notifications/log', trainer.token);
    check('GET /notifications/log as trainer -> 200 (read allowed)', r.status === 200 && Array.isArray(r.body.data.notifications));

    r = await req(base, 'GET', '/api/notifications/log', null);
    check('GET /notifications/log without token -> 401', r.status === 401);

    console.log(`\n✅ PASSED — all ${passed} checks green.\n`);
  } catch (err) {
    console.error(`\n❌ FAILED after ${passed} passing check(s): ${err.message}\n`);
    process.exitCode = 1;
  } finally {
    // Reminder rows written for pre-existing demo members during this run.
    await query('DELETE FROM notifications_log WHERE id > $1 AND NOT (member_id = ANY($2))', [beforeMax, memberIds.length ? memberIds : [0]]);
    if (memberIds.length) {
      await query('DELETE FROM notifications_log WHERE member_id = ANY($1)', [memberIds]);
      await query('DELETE FROM checkins WHERE member_id = ANY($1)', [memberIds]);
      await query('DELETE FROM subscriptions WHERE member_id = ANY($1)', [memberIds]);
      await query('DELETE FROM members WHERE id = ANY($1)', [memberIds]);
    }
    if (planId) await query('DELETE FROM membership_plans WHERE id = $1', [planId]);
    if (createdUserIds.length) await query('DELETE FROM users WHERE id = ANY($1)', [createdUserIds]);
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
})();
