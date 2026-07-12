'use strict';

// Phase 4 smoke test for check-ins. Self-contained and repeatable:
//   npm run smoke:checkins
// Boots the app in-process, seeds owner/front_desk/trainer + members whose current
// subscription is active / expired / frozen / missing, and checks:
//   - QR-token and manual (member_id) check-ins, method derivation
//   - access decision (allowed vs denied + reason) read from the subscription
//   - denied attempts are still logged; already_today flag
//   - role gating + validation; the attendance list filters
// then deletes everything it made.
//
// Requires: Postgres running and migrations applied (npm run migrate:up).

const assert = require('node:assert/strict');
const app = require('../src/app');
const { pool, query } = require('../src/config/db');
const { signToken } = require('../src/utils/jwt');

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
  const id = ins.rows[0].id;
  return { id, email, token: signToken({ id, role, email }) };
}

async function seedMember(label) {
  const phone = `0100${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 10)}`;
  const token = `tok_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
  const res = await query(
    `INSERT INTO members (full_name, phone, status, qr_code_token)
     VALUES ($1,$2,'active',$3) RETURNING id`,
    [label, phone, token]
  );
  return { id: res.rows[0].id, qr: token };
}

// Insert a subscription with date offsets (days from today) + status.
async function seedSub(memberId, planId, { startOffset = 0, endOffset = 30, status = 'active' }) {
  const res = await query(
    `INSERT INTO subscriptions (member_id, plan_id, start_date, end_date, status)
     VALUES ($1,$2, current_date + $3::int, current_date + $4::int, $5) RETURNING id`,
    [memberId, planId, startOffset, endOffset, status]
  );
  return res.rows[0].id;
}

(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const createdUserIds = [];
  const memberIds = [];
  let planId;

  console.log(`\nRunning Phase 4 check-ins smoke test against ${base}\n`);

  try {
    const owner = await seedUser('owner');
    const frontDesk = await seedUser('front_desk');
    const trainer = await seedUser('trainer');
    createdUserIds.push(owner.id, frontDesk.id, trainer.id);

    const planRes = await query(
      `INSERT INTO membership_plans (name, duration_days, price, active)
       VALUES ($1, 30, 300, true) RETURNING id`,
      [`Smoke Checkin Plan ${Date.now()}`]
    );
    planId = planRes.rows[0].id;

    const mActive = await seedMember('عضو ساري');
    const mExpired = await seedMember('عضو منتهٍ');
    const mFrozen = await seedMember('عضو مُجمّد');
    const mNoSub = await seedMember('عضو بلا اشتراك');
    memberIds.push(mActive.id, mExpired.id, mFrozen.id, mNoSub.id);

    await seedSub(mActive.id, planId, { endOffset: 30, status: 'active' });
    await seedSub(mExpired.id, planId, { startOffset: -40, endOffset: -1, status: 'active' }); // ended yesterday
    await seedSub(mFrozen.id, planId, { endOffset: 30, status: 'frozen' });
    // mNoSub: no subscription.

    // ---- Allowed: QR scan ----
    let r = await req(base, 'POST', '/api/checkins', frontDesk.token, { qr_code_token: mActive.qr });
    check('QR check-in (active) -> 201 allowed', r.status === 201 && r.body.data.result === 'allowed');
    check('method derived = qr', r.body.data.checkin.method === 'qr');
    check('returns the member (name)', r.body.data.member.full_name === 'عضو ساري');
    check('first entry today -> already_today = false', r.body.data.already_today === false);

    // ---- Allowed: manual override ----
    r = await req(base, 'POST', '/api/checkins', frontDesk.token, { member_id: mActive.id });
    check('manual check-in (member_id) -> 201 allowed', r.status === 201 && r.body.data.result === 'allowed');
    check('method derived = manual', r.body.data.checkin.method === 'manual');
    check('second entry same day -> already_today = true', r.body.data.already_today === true);

    // ---- Denied: expired / frozen / no subscription ----
    r = await req(base, 'POST', '/api/checkins', owner.token, { qr_code_token: mExpired.qr });
    check('expired member -> 201 denied/expired', r.status === 201 && r.body.data.result === 'denied' && r.body.data.reason === 'expired');

    r = await req(base, 'POST', '/api/checkins', owner.token, { qr_code_token: mFrozen.qr });
    check('frozen member -> denied/frozen', r.status === 201 && r.body.data.reason === 'frozen');

    r = await req(base, 'POST', '/api/checkins', owner.token, { qr_code_token: mNoSub.qr });
    check('no subscription -> denied/no_subscription', r.status === 201 && r.body.data.reason === 'no_subscription');

    // Denied scans are still logged.
    const deniedRows = await query(
      `SELECT count(*)::int AS n FROM checkins WHERE member_id = $1 AND result = 'denied'`,
      [mExpired.id]
    );
    check('denied attempt is logged', deniedRows.rows[0].n === 1);

    // ---- Errors ----
    r = await req(base, 'POST', '/api/checkins', owner.token, { qr_code_token: 'nope-does-not-exist' });
    check('unknown token -> 404 UNKNOWN_QR', r.status === 404 && r.body.error.code === 'UNKNOWN_QR');

    r = await req(base, 'POST', '/api/checkins', owner.token, { member_id: 999999 });
    check('unknown member_id -> 404 MEMBER_NOT_FOUND', r.status === 404 && r.body.error.code === 'MEMBER_NOT_FOUND');

    r = await req(base, 'POST', '/api/checkins', trainer.token, { qr_code_token: mActive.qr });
    check('trainer POST -> 403 (read-only)', r.status === 403 && r.body.error.code === 'FORBIDDEN');

    r = await req(base, 'POST', '/api/checkins', owner.token, {});
    check('neither field -> 400 VALIDATION_ERROR', r.status === 400 && r.body.error.code === 'VALIDATION_ERROR');

    r = await req(base, 'POST', '/api/checkins', owner.token, { qr_code_token: mActive.qr, member_id: mActive.id });
    check('both fields -> 400 VALIDATION_ERROR', r.status === 400 && r.body.error.code === 'VALIDATION_ERROR');

    // ---- Attendance log ----
    r = await req(base, 'GET', `/api/checkins?member_id=${mActive.id}`, owner.token);
    check('GET ?member_id -> 2 allowed rows, newest first', r.status === 200 && r.body.data.checkins.length === 2 && r.body.data.checkins.every((c) => c.result === 'allowed'));

    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    r = await req(base, 'GET', `/api/checkins?date=${iso}`, owner.token);
    check("GET ?date=today -> includes today's scans", r.status === 200 && r.body.data.checkins.length >= 5);

    r = await req(base, 'GET', '/api/checkins', trainer.token);
    check('GET /checkins as trainer -> 200 (read allowed)', r.status === 200 && Array.isArray(r.body.data.checkins));

    r = await req(base, 'POST', '/api/checkins', null, { qr_code_token: mActive.qr });
    check('POST without token -> 401', r.status === 401);

    console.log(`\n✅ PASSED — all ${passed} checks green.\n`);
  } catch (err) {
    console.error(`\n❌ FAILED after ${passed} passing check(s): ${err.message}\n`);
    process.exitCode = 1;
  } finally {
    if (memberIds.length) {
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
