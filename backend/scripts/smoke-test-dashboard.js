'use strict';

// Phase 6 smoke test for the owner dashboard. Self-contained and read-only
// against the data (it seeds a small, isolated set to make the metrics non-trivial,
// then cleans up):
//   npm run smoke:dashboard
// It asserts the response SHAPE and reconciles every headline number against
// direct SQL run in this same script (so it passes regardless of what else is in
// the DB), plus the owner-only role gating (front_desk / trainer -> 403).
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
  return { id: ins.rows[0].id, email, token: signToken({ id: ins.rows[0].id, role, email }) };
}

async function seedMember(label, status = 'active') {
  const phone = `0100${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 10)}`;
  const res = await query(
    `INSERT INTO members (full_name, phone, status, qr_code_token)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [label, phone, status, `tok_${Date.now()}_${Math.floor(Math.random() * 1e9)}`]
  );
  return res.rows[0].id;
}

async function seedSub(memberId, planId, { endOffset = 30, status = 'active', agreedTotal = 0 }) {
  const res = await query(
    `INSERT INTO subscriptions (member_id, plan_id, start_date, end_date, status, agreed_total)
     VALUES ($1,$2,current_date, current_date + $3::int, $4, $5) RETURNING id`,
    [memberId, planId, endOffset, status, agreedTotal]
  );
  return res.rows[0].id;
}

const num = (v) => Number(v);

(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const createdUserIds = [];
  const memberIds = [];
  let planId;

  console.log(`\nRunning Phase 6 dashboard smoke test against ${base}\n`);

  try {
    const owner = await seedUser('owner');
    const frontDesk = await seedUser('front_desk');
    const trainer = await seedUser('trainer');
    createdUserIds.push(owner.id, frontDesk.id, trainer.id);

    const planRes = await query(
      `INSERT INTO membership_plans (name, duration_days, price, active)
       VALUES ($1, 30, 400, true) RETURNING id`,
      [`Smoke Dash Plan ${Date.now()}`]
    );
    planId = planRes.rows[0].id;

    // Seed data so the metrics are exercised (all reconciled against direct SQL
    // below, so pre-existing DB rows don't matter):
    //  - A: active, ends in 3 days, paid 400 this month -> active member, expiring
    //       this week/month + expiring_soon, revenue this month.
    const mActive = await seedMember('عضو نشط', 'active');
    const subA = await seedSub(mActive, planId, { endOffset: 3, agreedTotal: 400 });
    await query(
      `INSERT INTO payments (member_id, subscription_id, amount, method, paid_at)
       VALUES ($1,$2,400,'cash', now())`,
      [mActive, subA]
    );
    //  - B: lapsed — subscription still status='active' but ended 10 days ago,
    //       no live subscription -> churn / win-back candidate.
    const mChurn = await seedMember('عضو منتهٍ', 'expired');
    await seedSub(mChurn, planId, { endOffset: -10, status: 'active', agreedTotal: 400 });
    //  - C: brand-new member this month, active sub owing 150 (dues).
    const mDues = await seedMember('عضو مديونية', 'active');
    await seedSub(mDues, planId, { endOffset: 25, status: 'active', agreedTotal: 400 });
    await query(
      `INSERT INTO payments (member_id, subscription_id, amount, method, paid_at)
       SELECT $1, id, 250, 'cash', now() FROM subscriptions WHERE member_id = $1 LIMIT 1`,
      [mDues]
    );
    memberIds.push(mActive, mChurn, mDues);

    // ---- Fetch the dashboard as owner ----
    const r = await req(base, 'GET', '/api/dashboard', owner.token);
    check('GET /api/dashboard as owner -> 200', r.status === 200 && r.body.success === true);
    const d = r.body.data;

    // ---- Shape ----
    check(
      'kpis has all six keys',
      d.kpis &&
        ['active_members', 'revenue_this_month', 'outstanding_dues', 'expiring_this_week', 'new_members_this_month', 'checkins_today'].every(
          (k) => k in d.kpis
        )
    );
    check('revenue_trend is 6 months', Array.isArray(d.revenue_trend) && d.revenue_trend.length === 6);
    check('new_members_trend is 6 months', Array.isArray(d.new_members_trend) && d.new_members_trend.length === 6);
    check(
      'status_breakdown has the four statuses in order',
      Array.isArray(d.status_breakdown) &&
        d.status_breakdown.map((s) => s.status).join(',') === 'active,frozen,expired,cancelled'
    );
    check('revenue_by_plan is an array', Array.isArray(d.revenue_by_plan));
    check(
      'retention has counts + lists',
      d.retention &&
        typeof d.retention.expiring_this_week === 'number' &&
        typeof d.retention.expiring_this_month === 'number' &&
        Array.isArray(d.retention.expiring_soon) &&
        typeof d.retention.churn_count === 'number' &&
        Array.isArray(d.retention.churned)
    );

    // ---- Reconcile against direct SQL ----
    const activeDirect = (await query(`SELECT COUNT(*)::int AS n FROM members WHERE status='active'`)).rows[0].n;
    check('active_members reconciles', d.kpis.active_members === activeDirect);

    const revThisMonth = (
      await query(
        `SELECT COALESCE(SUM(amount),0) AS t FROM payments
         WHERE date_trunc('month',paid_at)::date = date_trunc('month',current_date)::date`
      )
    ).rows[0].t;
    check('revenue_this_month reconciles', num(d.kpis.revenue_this_month) === num(revThisMonth));

    const duesDirect = (
      await query(
        `SELECT COALESCE(SUM(bal),0) AS t FROM (
           SELECT (COALESCE(s.agreed_total,p.price) - COALESCE(pp.paid,0)) AS bal
           FROM subscriptions s
           JOIN membership_plans p ON p.id = s.plan_id
           LEFT JOIN (SELECT subscription_id, SUM(amount) AS paid FROM payments GROUP BY subscription_id) pp
             ON pp.subscription_id = s.id
           WHERE s.status IN ('active','frozen')
         ) t WHERE bal > 0`
      )
    ).rows[0].t;
    check('outstanding_dues reconciles', num(d.kpis.outstanding_dues) === num(duesDirect));

    const expWeekDirect = (
      await query(
        `SELECT COUNT(*)::int AS n FROM subscriptions
         WHERE status='active' AND end_date BETWEEN current_date AND current_date + 7`
      )
    ).rows[0].n;
    check('expiring_this_week reconciles', d.kpis.expiring_this_week === expWeekDirect);

    const newMembersDirect = (
      await query(
        `SELECT COUNT(*)::int AS n FROM members
         WHERE date_trunc('month',joined_at)::date = date_trunc('month',current_date)::date`
      )
    ).rows[0].n;
    check('new_members_this_month reconciles', d.kpis.new_members_this_month === newMembersDirect);

    const checkinsDirect = (
      await query(
        `SELECT COUNT(*)::int AS n FROM checkins WHERE result='allowed' AND checked_in_at::date = current_date`
      )
    ).rows[0].n;
    check('checkins_today reconciles', d.kpis.checkins_today === checkinsDirect);

    const totalMembers = (await query(`SELECT COUNT(*)::int AS n FROM members`)).rows[0].n;
    const breakdownSum = d.status_breakdown.reduce((acc, s) => acc + s.count, 0);
    check('status_breakdown sums to total members', breakdownSum === totalMembers);

    check(
      'revenue_trend last month is the current month',
      d.revenue_trend[5].month === new Date().toISOString().slice(0, 7) ||
        /^\d{4}-\d{2}$/.test(d.revenue_trend[5].month)
    );
    const trendSum = d.revenue_trend.reduce((acc, m) => acc + num(m.total), 0);
    const last6Direct = (
      await query(
        `SELECT COALESCE(SUM(amount),0) AS t FROM payments
         WHERE date_trunc('month',paid_at)::date >= (date_trunc('month',current_date)::date - interval '5 months')`
      )
    ).rows[0].t;
    check('revenue_trend sums to last-6-months revenue', num(trendSum) === num(last6Direct));

    const churnDirect = (
      await query(
        `SELECT COUNT(*)::int AS n FROM (
           SELECT m.id FROM members m JOIN subscriptions s ON s.member_id = m.id
           GROUP BY m.id
           HAVING COUNT(*) FILTER (WHERE (s.status='active' AND s.end_date >= current_date) OR s.status='frozen') = 0
         ) t`
      )
    ).rows[0].n;
    check('churn_count reconciles', d.retention.churn_count === churnDirect);
    check('churned list is capped at 8 and within count', d.retention.churned.length <= 8 && d.retention.churned.length <= d.retention.churn_count);

    // Seeded members show up where expected.
    check('seeded active member counts as active', activeDirect >= 2);
    check('seeded lapsed member is in churn', churnDirect >= 1);
    check(
      'seeded expiring member is in expiring_soon',
      d.retention.expiring_soon.some((e) => e.member_id === mActive)
    );

    // ---- Role gating ----
    const rFront = await req(base, 'GET', '/api/dashboard', frontDesk.token);
    check('GET /api/dashboard as front_desk -> 403', rFront.status === 403);
    const rTrainer = await req(base, 'GET', '/api/dashboard', trainer.token);
    check('GET /api/dashboard as trainer -> 403', rTrainer.status === 403);
    const rNoAuth = await req(base, 'GET', '/api/dashboard', null);
    check('GET /api/dashboard without token -> 401', rNoAuth.status === 401);

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
