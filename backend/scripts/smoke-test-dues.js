'use strict';

// Phase 3b smoke test for installment balances + the attention (renewals/dues)
// endpoint. Self-contained and repeatable:
//   npm run smoke:dues
// Boots the app in-process, seeds owner/front_desk/trainer + members with
// subscriptions, and checks:
//   - agreed_total defaults to the plan price, or takes a discount
//   - amount_paid / balance / is_paid math across partial then full payment
//   - GET /subscriptions/attention: dues list (unpaid) + renewals list (ending
//     soon), the `within` window, and role gating
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

// Find a subscription row in an attention list by member id.
const forMember = (rows, memberId) => rows.find((r) => r.member_id === memberId);

(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const createdUserIds = [];
  const memberIds = [];
  let planId;

  console.log(`\nRunning Phase 3b installments + dues smoke test against ${base}\n`);

  try {
    const owner = await seedUser('owner');
    const frontDesk = await seedUser('front_desk');
    const trainer = await seedUser('trainer');
    createdUserIds.push(owner.id, frontDesk.id, trainer.id);

    // One active plan: 300 EGP / 30 days.
    const planRes = await query(
      `INSERT INTO membership_plans (name, duration_days, price, active)
       VALUES ($1, 30, 300, true) RETURNING id`,
      [`Smoke Dues Plan ${Date.now()}`]
    );
    planId = planRes.rows[0].id;

    const mA = await seedMember('عضو المديونية أ'); // no agreed_total, no payment -> owes 300
    const mB = await seedMember('عضو المديونية ب'); // discount 250, pays 100 then 150
    const mC = await seedMember('عضو مسدِّد بالكامل'); // pays in full -> in neither list
    const mD = await seedMember('عضو تجديد مستحق'); // end_date forced to +3 days
    memberIds.push(mA, mB, mC, mD);

    // ---- agreed_total default ----
    let r = await req(base, 'POST', '/api/subscriptions', owner.token, { member_id: mA, plan_id: planId });
    check('subscribe (no agreed_total) -> 201', r.status === 201);

    r = await req(base, 'GET', `/api/members/${mA}/subscriptions`, owner.token);
    let subA = r.body.data.subscriptions[0];
    check('agreed_total defaults to plan price (300)', Number(subA.agreed_total) === 300);
    check('amount_paid = 0 when nothing paid', Number(subA.amount_paid) === 0);
    check('balance = 300 (full owed)', Number(subA.balance) === 300);
    check('is_paid = false when unpaid', subA.is_paid === false);

    // ---- discount + partial payment ----
    r = await req(base, 'POST', '/api/subscriptions', owner.token, {
      member_id: mB, plan_id: planId, agreed_total: 250, payment: { amount: 100, method: 'cash' },
    });
    check('subscribe with discount 250 + 100 paid -> 201', r.status === 201);
    const subB = r.body.data.subscription;
    check('agreed_total takes the discount (250)', Number(subB.agreed_total) === 250);
    check('amount_paid = 100 after opening installment', Number(subB.amount_paid) === 100);
    check('balance = 150 remaining', Number(subB.balance) === 150);
    check('is_paid = false (still owes)', subB.is_paid === false);

    // Pay the remaining 150.
    r = await req(base, 'POST', '/api/payments', owner.token, {
      member_id: mB, subscription_id: subB.id, amount: 150, method: 'cash',
    });
    check('pay remaining 150 -> 201', r.status === 201);

    r = await req(base, 'GET', `/api/members/${mB}/subscriptions`, owner.token);
    const subBAfter = r.body.data.subscriptions[0];
    check('amount_paid = 250 after full payment', Number(subBAfter.amount_paid) === 250);
    check('balance = 0 when paid in full', Number(subBAfter.balance) === 0);
    check('is_paid = true when paid in full', subBAfter.is_paid === true);

    // ---- paid-in-full member (appears in neither attention list) ----
    r = await req(base, 'POST', '/api/subscriptions', owner.token, {
      member_id: mC, plan_id: planId, payment: { amount: 300, method: 'cash' },
    });
    check('subscribe + pay full -> is_paid true', r.status === 201 && r.body.data.subscription.is_paid === true);

    // ---- renewal-due member: force end_date within the window ----
    r = await req(base, 'POST', '/api/subscriptions', owner.token, { member_id: mD, plan_id: planId });
    const subDId = r.body.data.subscription.id;
    await query('UPDATE subscriptions SET end_date = current_date + 3 WHERE id = $1', [subDId]);

    // ---- attention endpoint ----
    r = await req(base, 'GET', '/api/subscriptions/attention', owner.token); // default within=7
    check('GET /attention -> 200 with { renewals, dues }', r.status === 200 && Array.isArray(r.body.data.dues) && Array.isArray(r.body.data.renewals));
    const { renewals, dues } = r.body.data;

    const dueA = forMember(dues, mA);
    check('dues includes the unpaid member (mA)', !!dueA && Number(dueA.balance) === 300);
    check('due row carries member_name + phone', typeof dueA.member_name === 'string' && typeof dueA.phone === 'string');
    check('dues excludes the fully-paid member (mB)', !forMember(dues, mB));
    check('dues excludes the paid-in-full member (mC)', !forMember(dues, mC));

    const renD = forMember(renewals, mD);
    check('renewals includes the soon-ending member (mD)', !!renD && renD.days_left >= 1 && renD.days_left <= 7);
    check('renewals excludes the far-future member (mA, +30d)', !forMember(renewals, mA));

    // within widens the renewal window.
    r = await req(base, 'GET', '/api/subscriptions/attention?within=90', owner.token);
    check('within=90 -> mA (+30d) now shows in renewals', !!forMember(r.body.data.renewals, mA));

    // ---- role gating ----
    r = await req(base, 'GET', '/api/subscriptions/attention', frontDesk.token);
    check('GET /attention as front_desk -> 200', r.status === 200);
    r = await req(base, 'GET', '/api/subscriptions/attention', trainer.token);
    check('GET /attention as trainer -> 403', r.status === 403 && r.body.error.code === 'FORBIDDEN');

    // ---- validation ----
    r = await req(base, 'POST', '/api/subscriptions', owner.token, { member_id: mA, plan_id: planId, agreed_total: -5 });
    check('negative agreed_total -> 400 VALIDATION_ERROR', r.status === 400 && r.body.error.code === 'VALIDATION_ERROR');

    console.log(`\n✅ PASSED — all ${passed} checks green.\n`);
  } catch (err) {
    console.error(`\n❌ FAILED after ${passed} passing check(s): ${err.message}\n`);
    process.exitCode = 1;
  } finally {
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
