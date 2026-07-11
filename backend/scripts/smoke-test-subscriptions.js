'use strict';

// Phase 2 smoke test for plans + subscriptions. Self-contained and repeatable:
//   npm run smoke:subs
// Boots the app in-process on an ephemeral port, seeds owner/front_desk/trainer
// + a member, exercises plan CRUD role-gating and the full subscription
// lifecycle (create computes end_date + flips member.status; freeze; unfreeze
// extends end_date by the frozen days; cancel), then deletes everything it made.
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

(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const createdUserIds = [];
  let memberId;
  let planId;
  let subId;

  console.log(`\nRunning Phase 2 plans+subscriptions smoke test against ${base}\n`);

  try {
    const owner = await seedUser('owner');
    const frontDesk = await seedUser('front_desk');
    const trainer = await seedUser('trainer');
    createdUserIds.push(owner.id, frontDesk.id, trainer.id);

    // A member to subscribe (starts 'expired' so we can watch the status sync).
    const phone = `0100${Date.now().toString().slice(-7)}`;
    const memRes = await query(
      `INSERT INTO members (full_name, phone, status, qr_code_token)
       VALUES ($1,$2,'expired',$3) RETURNING id`,
      ['عضو اختبار الاشتراكات', phone, `tok_${Date.now()}_${Math.floor(Math.random() * 1e6)}`]
    );
    memberId = memRes.rows[0].id;

    // ---- Plans: role gating on writes ----
    let r = await req(base, 'POST', '/api/plans', frontDesk.token, { name: `FD ${Date.now()}`, duration_days: 30, price: 100 });
    check('POST /api/plans as front_desk -> 403 FORBIDDEN', r.status === 403 && r.body.error.code === 'FORBIDDEN');

    r = await req(base, 'POST', '/api/plans', trainer.token, { name: `TR ${Date.now()}`, duration_days: 30, price: 100 });
    check('POST /api/plans as trainer -> 403', r.status === 403);

    r = await req(base, 'POST', '/api/plans', owner.token, { name: `Smoke Plan ${Date.now()}`, duration_days: 30, price: 250 });
    check('POST /api/plans as owner -> 201', r.status === 201);
    planId = r.body.data.plan.id;
    check('created plan has duration_days = 30', r.body.data.plan.duration_days === 30);

    r = await req(base, 'POST', '/api/plans', owner.token, { name: 'x', duration_days: -5, price: 10 });
    check('invalid plan -> 400 VALIDATION_ERROR', r.status === 400 && r.body.error.code === 'VALIDATION_ERROR');

    r = await req(base, 'GET', '/api/plans', trainer.token);
    check('GET /api/plans as trainer -> 200 (read allowed)', r.status === 200 && Array.isArray(r.body.data.plans));

    r = await req(base, 'PATCH', `/api/plans/${planId}`, owner.token, { price: 275 });
    check('PATCH /api/plans/:id price -> 200 (275)', r.status === 200 && Number(r.body.data.plan.price) === 275);

    // ---- Subscriptions ----
    // Create (front_desk allowed); end_date computed = start + 30d.
    r = await req(base, 'POST', '/api/subscriptions', frontDesk.token, {
      member_id: memberId,
      plan_id: planId,
      start_date: '2026-01-01',
    });
    check('POST /api/subscriptions (front_desk) -> 201', r.status === 201);
    subId = r.body.data.subscription.id;
    check('end_date computed = 2026-01-31 (start + 30d)', r.body.data.subscription.end_date === '2026-01-31');
    check('subscription carries plan_name', typeof r.body.data.subscription.plan_name === 'string');

    let m = await query('SELECT status FROM members WHERE id = $1', [memberId]);
    check('member.status synced -> active after subscribe', m.rows[0].status === 'active');

    r = await req(base, 'POST', '/api/subscriptions', trainer.token, { member_id: memberId, plan_id: planId });
    check('POST /api/subscriptions as trainer -> 403', r.status === 403);

    // Inactive plan is rejected.
    await query('UPDATE membership_plans SET active = false WHERE id = $1', [planId]);
    r = await req(base, 'POST', '/api/subscriptions', owner.token, { member_id: memberId, plan_id: planId });
    check('subscribe to inactive plan -> 409 PLAN_INACTIVE', r.status === 409 && r.body.error.code === 'PLAN_INACTIVE');
    await query('UPDATE membership_plans SET active = true WHERE id = $1', [planId]);

    // Member-scoped history.
    r = await req(base, 'GET', `/api/members/${memberId}/subscriptions`, owner.token);
    check('GET /api/members/:id/subscriptions -> 200 includes the sub', r.status === 200 && r.body.data.subscriptions.some((s) => s.id === subId));

    // ---- Freeze -> unfreeze extends end_date ----
    r = await req(base, 'PATCH', `/api/subscriptions/${subId}`, frontDesk.token, { action: 'freeze' });
    check('PATCH freeze -> 200 status frozen', r.status === 200 && r.body.data.subscription.status === 'frozen');
    m = await query('SELECT status FROM members WHERE id = $1', [memberId]);
    check('member.status synced -> frozen', m.rows[0].status === 'frozen');

    // Capture end_date, then backdate frozen_from by 10 days to simulate a freeze.
    const before = await query('SELECT end_date FROM subscriptions WHERE id = $1', [subId]);
    const endBefore = before.rows[0].end_date;
    await query(`UPDATE subscriptions SET frozen_from = current_date - 10 WHERE id = $1`, [subId]);

    r = await req(base, 'PATCH', `/api/subscriptions/${subId}`, owner.token, { action: 'unfreeze' });
    check('PATCH unfreeze -> 200 status active', r.status === 200 && r.body.data.subscription.status === 'active');
    const after = await query('SELECT end_date FROM subscriptions WHERE id = $1', [subId]);
    const diffDays = Math.round((new Date(after.rows[0].end_date) - new Date(endBefore)) / 86400000);
    check('unfreeze extended end_date by 10 days', diffDays === 10);
    m = await query('SELECT status FROM members WHERE id = $1', [memberId]);
    check('member.status synced -> active after unfreeze', m.rows[0].status === 'active');

    // Invalid transition.
    r = await req(base, 'PATCH', `/api/subscriptions/${subId}`, owner.token, { action: 'unfreeze' });
    check('unfreeze an active sub -> 409 INVALID_TRANSITION', r.status === 409 && r.body.error.code === 'INVALID_TRANSITION');

    // Cancel.
    r = await req(base, 'PATCH', `/api/subscriptions/${subId}`, owner.token, { action: 'cancel' });
    check('PATCH cancel -> 200 status cancelled', r.status === 200 && r.body.data.subscription.status === 'cancelled');
    m = await query('SELECT status FROM members WHERE id = $1', [memberId]);
    check('member.status synced -> cancelled', m.rows[0].status === 'cancelled');

    r = await req(base, 'PATCH', '/api/subscriptions/999999', owner.token, { action: 'cancel' });
    check('PATCH unknown sub -> 404 SUBSCRIPTION_NOT_FOUND', r.status === 404 && r.body.error.code === 'SUBSCRIPTION_NOT_FOUND');

    r = await req(base, 'GET', '/api/plans', null);
    check('GET /api/plans without token -> 401', r.status === 401);

    console.log(`\n✅ PASSED — all ${passed} checks green.\n`);
  } catch (err) {
    console.error(`\n❌ FAILED after ${passed} passing check(s): ${err.message}\n`);
    process.exitCode = 1;
  } finally {
    if (memberId) await query('DELETE FROM subscriptions WHERE member_id = $1', [memberId]);
    if (memberId) await query('DELETE FROM members WHERE id = $1', [memberId]);
    if (planId) await query('DELETE FROM membership_plans WHERE id = $1', [planId]);
    if (createdUserIds.length) await query('DELETE FROM users WHERE id = ANY($1)', [createdUserIds]);
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
})();
