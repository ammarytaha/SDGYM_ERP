'use strict';

// Phase 3 smoke test for payments. Self-contained and repeatable:
//   npm run smoke:payments
// Boots the app in-process on an ephemeral port, seeds owner/front_desk/trainer
// + a few members each with a subscription, exercises:
//   - POST /api/payments role gating + validation + not-found paths
//   - amount precision + backdated paid_at
//   - GET /api/members/:id/payments (history, newest first)
//   - the ATOMIC subscribe-and-pay path: POST /api/subscriptions with an embedded
//     payment creates both together, and a payment that fails the DB CHECK rolls
//     the whole subscription back (nothing persists)
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
  const res = await query(
    `INSERT INTO members (full_name, phone, status, qr_code_token)
     VALUES ($1,$2,'expired',$3) RETURNING id`,
    [label, phone, `tok_${Date.now()}_${Math.floor(Math.random() * 1e6)}`]
  );
  return res.rows[0].id;
}

async function seedSubscription(memberId, planId, days) {
  const res = await query(
    `INSERT INTO subscriptions (member_id, plan_id, start_date, end_date, status)
     VALUES ($1,$2,current_date, current_date + $3::int, 'active') RETURNING id`,
    [memberId, planId, days]
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

  console.log(`\nRunning Phase 3 payments smoke test against ${base}\n`);

  try {
    const owner = await seedUser('owner');
    const frontDesk = await seedUser('front_desk');
    const trainer = await seedUser('trainer');
    createdUserIds.push(owner.id, frontDesk.id, trainer.id);

    // One active plan (300 EGP / 30d) reused across the test members.
    const planRes = await query(
      `INSERT INTO membership_plans (name, duration_days, price, active)
       VALUES ($1, 30, 300, true) RETURNING id`,
      [`Smoke Pay Plan ${Date.now()}`]
    );
    planId = planRes.rows[0].id;

    // m1: main member with a subscription (most create/list tests).
    // m2: a different member+sub (to prove ownership enforcement).
    // m3: fresh member (atomic subscribe-and-pay success).
    // m4: fresh member (rollback — nothing should persist).
    const m1 = await seedMember('عضو المدفوعات ١');
    const m2 = await seedMember('عضو المدفوعات ٢');
    const m3 = await seedMember('عضو المدفوعات ٣');
    const m4 = await seedMember('عضو المدفوعات ٤');
    memberIds.push(m1, m2, m3, m4);
    const sub1 = await seedSubscription(m1, planId, 30);
    const sub2 = await seedSubscription(m2, planId, 30);

    // ---- POST /api/payments: role gating ----
    let r = await req(base, 'POST', '/api/payments', owner.token, {
      member_id: m1, subscription_id: sub1, amount: 300, method: 'cash', notes: 'دفعة كاملة',
    });
    check('POST /api/payments as owner -> 201', r.status === 201);
    check('created payment amount = 300', Number(r.body.data.payment.amount) === 300);
    check('created payment method = cash', r.body.data.payment.method === 'cash');
    check('payment carries plan_name', typeof r.body.data.payment.plan_name === 'string');

    r = await req(base, 'POST', '/api/payments', frontDesk.token, {
      member_id: m1, subscription_id: sub1, amount: 150, method: 'card_manual',
    });
    check('POST /api/payments as front_desk -> 201', r.status === 201);

    r = await req(base, 'POST', '/api/payments', trainer.token, {
      member_id: m1, subscription_id: sub1, amount: 50, method: 'cash',
    });
    check('POST /api/payments as trainer -> 403 (read-only)', r.status === 403 && r.body.error.code === 'FORBIDDEN');

    // ---- Validation ----
    r = await req(base, 'POST', '/api/payments', owner.token, { member_id: m1, subscription_id: sub1, method: 'cash' });
    check('missing amount -> 400 VALIDATION_ERROR', r.status === 400 && r.body.error.code === 'VALIDATION_ERROR');

    r = await req(base, 'POST', '/api/payments', owner.token, { member_id: m1, subscription_id: sub1, amount: 0, method: 'cash' });
    check('amount = 0 -> 400 VALIDATION_ERROR', r.status === 400 && r.body.error.code === 'VALIDATION_ERROR');

    r = await req(base, 'POST', '/api/payments', owner.token, { member_id: m1, subscription_id: sub1, amount: -5, method: 'cash' });
    check('negative amount -> 400', r.status === 400);

    r = await req(base, 'POST', '/api/payments', owner.token, { member_id: m1, subscription_id: sub1, amount: 100, method: 'bitcoin' });
    check('bad method -> 400', r.status === 400);

    // ---- Not-found paths ----
    r = await req(base, 'POST', '/api/payments', owner.token, { member_id: 999999, subscription_id: sub1, amount: 100, method: 'cash' });
    check('unknown member -> 404 MEMBER_NOT_FOUND', r.status === 404 && r.body.error.code === 'MEMBER_NOT_FOUND');

    // sub2 belongs to m2, so paying it as m1 must be rejected.
    r = await req(base, 'POST', '/api/payments', owner.token, { member_id: m1, subscription_id: sub2, amount: 100, method: 'cash' });
    check("another member's subscription -> 404 SUBSCRIPTION_NOT_FOUND", r.status === 404 && r.body.error.code === 'SUBSCRIPTION_NOT_FOUND');

    // ---- Precision + backdating ----
    r = await req(base, 'POST', '/api/payments', owner.token, { member_id: m1, subscription_id: sub1, amount: 300.5, method: 'cash' });
    check('amount 300.50 round-trips as "300.50"', r.status === 201 && r.body.data.payment.amount === '300.50');
    const precisionPaymentId = r.body.data.payment.id;

    r = await req(base, 'POST', '/api/payments', owner.token, { member_id: m1, subscription_id: sub1, amount: 100, method: 'cash', paid_at: '2026-07-01' });
    check('backdated paid_at -> paid_date = 2026-07-01', r.status === 201 && r.body.data.payment.paid_date === '2026-07-01');

    // ---- GET /api/members/:id/payments ----
    r = await req(base, 'GET', `/api/members/${m1}/payments`, owner.token);
    check('GET member payments -> 200 with 4 payments', r.status === 200 && r.body.data.payments.length === 4);
    // Newest first: the precision payment (paid now) outranks the backdated one.
    check('payments newest-first (precision payment at top)', r.body.data.payments[0].id === precisionPaymentId);

    r = await req(base, 'GET', `/api/members/${m1}/payments`, trainer.token);
    check('GET member payments as trainer -> 200 (read allowed)', r.status === 200 && Array.isArray(r.body.data.payments));

    r = await req(base, 'GET', '/api/members/999999/payments', owner.token);
    check('GET payments for unknown member -> 404', r.status === 404 && r.body.error.code === 'MEMBER_NOT_FOUND');

    // ---- Atomic subscribe-and-pay: success ----
    r = await req(base, 'POST', '/api/subscriptions', owner.token, {
      member_id: m3, plan_id: planId, payment: { amount: 300, method: 'cash', notes: 'اشتراك جديد' },
    });
    check('POST /api/subscriptions with embedded payment -> 201', r.status === 201);
    const newSubId = r.body.data.subscription.id;

    r = await req(base, 'GET', `/api/members/${m3}/payments`, owner.token);
    check('embedded payment recorded (1 payment for m3)', r.status === 200 && r.body.data.payments.length === 1);
    check('embedded payment tied to the new subscription', r.body.data.payments[0].subscription_id === newSubId);
    check('embedded payment amount = 300', Number(r.body.data.payments[0].amount) === 300);

    const m3status = await query('SELECT status FROM members WHERE id = $1', [m3]);
    check('member.status active after subscribe-and-pay', m3status.rows[0].status === 'active');

    // ---- Atomic subscribe-and-pay: rollback ----
    // amount 0.004 passes zod (> 0) but numeric(10,2) rounds it to 0.00, which
    // violates the DB CHECK (amount > 0) — the payment insert throws INSIDE the
    // transaction, so the subscription + member update must roll back too.
    const subsBefore = await query('SELECT count(*)::int AS n FROM subscriptions WHERE member_id = $1', [m4]);
    r = await req(base, 'POST', '/api/subscriptions', owner.token, {
      member_id: m4, plan_id: planId, payment: { amount: 0.004, method: 'cash' },
    });
    check('subscribe with a DB-invalid embedded payment -> request fails (not 201)', r.status >= 400 && r.status !== 201);

    const subsAfter = await query('SELECT count(*)::int AS n FROM subscriptions WHERE member_id = $1', [m4]);
    check('rollback: no subscription persisted for m4', subsBefore.rows[0].n === 0 && subsAfter.rows[0].n === 0);

    const paysAfter = await query('SELECT count(*)::int AS n FROM payments WHERE member_id = $1', [m4]);
    check('rollback: no payment persisted for m4', paysAfter.rows[0].n === 0);

    const m4status = await query('SELECT status FROM members WHERE id = $1', [m4]);
    check("rollback: m4.status unchanged (still 'expired')", m4status.rows[0].status === 'expired');

    // ---- Auth ----
    r = await req(base, 'POST', '/api/payments', null, { member_id: m1, subscription_id: sub1, amount: 100, method: 'cash' });
    check('POST /api/payments without token -> 401', r.status === 401);

    console.log(`\n✅ PASSED — all ${passed} checks green.\n`);
  } catch (err) {
    console.error(`\n❌ FAILED after ${passed} passing check(s): ${err.message}\n`);
    process.exitCode = 1;
  } finally {
    // payments + subscriptions cascade off members, but delete explicitly to be tidy.
    if (memberIds.length) {
      await query('DELETE FROM payments WHERE member_id = ANY($1)', [memberIds]);
      await query('DELETE FROM subscriptions WHERE member_id = ANY($1)', [memberIds]);
      await query('DELETE FROM members WHERE id = ANY($1)', [memberIds]);
    }
    if (planId) await query('DELETE FROM membership_plans WHERE id = $1', [planId]);
    if (createdUserIds.length) await query('DELETE FROM users WHERE id = ANY($1)', [createdUserIds]);
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
})();
