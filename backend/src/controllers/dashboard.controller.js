'use strict';

// Owner dashboard (spec §7 #2, expanded to a business-development view at the
// owner's request — Phase 6). One read-only endpoint that returns everything the
// owner needs in a single call: at-a-glance KPIs, plus Financial / Growth /
// Retention breakdowns. Every aggregate is computed in Postgres against
// current_date (same "today" the rest of the app uses), reusing the Phase 3b
// payment-sum pattern for balances. No data is mutated — this is pure reporting.
//
// Conventions kept consistent with the other modules:
//   - counts are cast ::int so they arrive as JSON numbers, not strings
//   - money stays numeric (pg serialises it as a string); the frontend formats it
//   - dates are to_char'd to 'YYYY-MM-DD' (and month labels to 'YYYY-MM') so JSON
//     never UTC-shifts a pg DATE by a day

const { query } = require('../config/db');
const { ok } = require('../utils/apiResponse');

// The four membership statuses, in a fixed display order. Used to zero-fill the
// status breakdown so every status renders even with a count of 0.
const MEMBER_STATUSES = ['active', 'frozen', 'expired', 'cancelled'];

// A per-subscription paid-sum subquery — the same one the subscriptions module
// uses for its installment math. Reused below wherever a balance is needed.
const PAID_SUBQUERY = `
  LEFT JOIN (
    SELECT subscription_id, SUM(amount) AS paid
    FROM payments
    GROUP BY subscription_id
  ) pp ON pp.subscription_id = s.id
`;

/**
 * GET /api/dashboard (owner only)
 * Returns { kpis, revenue_trend, revenue_by_plan, new_members_trend,
 *           status_breakdown, retention } in one envelope.
 */
async function getDashboard(req, res) {
  // ---- KPIs (each a single scalar) ----
  const kpisPromise = (async () => {
    const [
      activeMembers,
      revenueThisMonth,
      outstandingDues,
      expiringThisWeek,
      newMembersThisMonth,
      checkinsToday,
    ] = await Promise.all([
      query(`SELECT COUNT(*)::int AS n FROM members WHERE status = 'active'`),
      query(
        `SELECT COALESCE(SUM(amount), 0) AS total
         FROM payments
         WHERE date_trunc('month', paid_at)::date = date_trunc('month', current_date)::date`
      ),
      // Sum of positive balances across current (active/frozen) subscriptions.
      query(
        `SELECT COALESCE(SUM(bal), 0) AS total FROM (
           SELECT (COALESCE(s.agreed_total, p.price) - COALESCE(pp.paid, 0)) AS bal
           FROM subscriptions s
           JOIN membership_plans p ON p.id = s.plan_id
           ${PAID_SUBQUERY}
           WHERE s.status IN ('active', 'frozen')
         ) t
         WHERE bal > 0`
      ),
      query(
        `SELECT COUNT(*)::int AS n FROM subscriptions
         WHERE status = 'active' AND end_date BETWEEN current_date AND current_date + 7`
      ),
      query(
        `SELECT COUNT(*)::int AS n FROM members
         WHERE date_trunc('month', joined_at)::date = date_trunc('month', current_date)::date`
      ),
      query(
        `SELECT COUNT(*)::int AS n FROM checkins
         WHERE result = 'allowed' AND checked_in_at::date = current_date`
      ),
    ]);

    return {
      active_members: activeMembers.rows[0].n,
      revenue_this_month: revenueThisMonth.rows[0].total,
      outstanding_dues: outstandingDues.rows[0].total,
      expiring_this_week: expiringThisWeek.rows[0].n,
      new_members_this_month: newMembersThisMonth.rows[0].n,
      checkins_today: checkinsToday.rows[0].n,
    };
  })();

  // ---- Financial ----
  // Revenue per month for the last 6 months. A generated month scaffold LEFT JOINs
  // payments so empty months still appear (a continuous chart, no gaps).
  const revenueTrendPromise = query(
    `WITH months AS (
       SELECT (date_trunc('month', current_date)::date - (n || ' months')::interval)::date AS m
       FROM generate_series(0, 5) AS n
     )
     SELECT to_char(months.m, 'YYYY-MM') AS month,
            COALESCE(SUM(p.amount), 0) AS total
     FROM months
     LEFT JOIN payments p ON date_trunc('month', p.paid_at)::date = months.m
     GROUP BY months.m
     ORDER BY months.m ASC`
  );

  // Revenue + active-subscription count per plan (which products earn most).
  const revenueByPlanPromise = query(
    `SELECT pl.id AS plan_id, pl.name AS plan_name,
            COALESCE(SUM(pay.amount), 0) AS revenue,
            COUNT(DISTINCT CASE WHEN s.status = 'active' THEN s.id END)::int AS active_subs
     FROM membership_plans pl
     LEFT JOIN subscriptions s ON s.plan_id = pl.id
     LEFT JOIN payments pay ON pay.subscription_id = s.id
     GROUP BY pl.id, pl.name
     ORDER BY revenue DESC, pl.name ASC`
  );

  // ---- Growth ----
  const newMembersTrendPromise = query(
    `WITH months AS (
       SELECT (date_trunc('month', current_date)::date - (n || ' months')::interval)::date AS m
       FROM generate_series(0, 5) AS n
     )
     SELECT to_char(months.m, 'YYYY-MM') AS month,
            COUNT(mem.id)::int AS count
     FROM months
     LEFT JOIN members mem ON date_trunc('month', mem.joined_at)::date = months.m
     GROUP BY months.m
     ORDER BY months.m ASC`
  );

  const statusBreakdownPromise = query(
    `SELECT status, COUNT(*)::int AS count FROM members GROUP BY status`
  );

  // ---- Retention ----
  const retentionPromise = (async () => {
    const [expiringWeek, expiringMonth, expiringSoon, churnCount, churned] = await Promise.all([
      query(
        `SELECT COUNT(*)::int AS n FROM subscriptions
         WHERE status = 'active' AND end_date BETWEEN current_date AND current_date + 7`
      ),
      query(
        `SELECT COUNT(*)::int AS n FROM subscriptions
         WHERE status = 'active' AND end_date BETWEEN current_date AND current_date + 30`
      ),
      // Soonest-expiring active subscriptions (renewal pipeline), joined with the
      // member so the front desk can act.
      query(
        `SELECT s.id AS subscription_id, s.member_id, m.full_name AS member_name, m.phone,
                pl.name AS plan_name,
                to_char(s.end_date, 'YYYY-MM-DD') AS end_date,
                (s.end_date - current_date) AS days_left
         FROM subscriptions s
         JOIN members m ON m.id = s.member_id
         JOIN membership_plans pl ON pl.id = s.plan_id
         WHERE s.status = 'active' AND s.end_date BETWEEN current_date AND current_date + 30
         ORDER BY s.end_date ASC, s.id ASC
         LIMIT 8`
      ),
      // Churn = members who have subscribed before but have NO currently live
      // subscription — i.e. none that is active-and-not-past-end or frozen (the
      // same "live" test evaluateAccess uses for the kiosk). This catches lapsed
      // members whose row still reads status='active' because there's no expiry
      // cron, as well as cancelled ones. They're the win-back list.
      query(
        `SELECT COUNT(*)::int AS n FROM (
           SELECT m.id
           FROM members m
           JOIN subscriptions s ON s.member_id = m.id
           GROUP BY m.id
           HAVING COUNT(*) FILTER (
             WHERE (s.status = 'active' AND s.end_date >= current_date) OR s.status = 'frozen'
           ) = 0
         ) t`
      ),
      query(
        `SELECT m.id AS member_id, m.full_name AS member_name, m.phone,
                to_char(MAX(s.end_date), 'YYYY-MM-DD') AS last_end_date,
                (current_date - MAX(s.end_date)) AS days_since
         FROM members m
         JOIN subscriptions s ON s.member_id = m.id
         GROUP BY m.id, m.full_name, m.phone
         HAVING COUNT(*) FILTER (
           WHERE (s.status = 'active' AND s.end_date >= current_date) OR s.status = 'frozen'
         ) = 0
         ORDER BY MAX(s.end_date) DESC
         LIMIT 8`
      ),
    ]);

    return {
      expiring_this_week: expiringWeek.rows[0].n,
      expiring_this_month: expiringMonth.rows[0].n,
      expiring_soon: expiringSoon.rows,
      churn_count: churnCount.rows[0].n,
      churned: churned.rows,
    };
  })();

  const [kpis, revenueTrend, revenueByPlan, newMembersTrend, statusRows, retention] =
    await Promise.all([
      kpisPromise,
      revenueTrendPromise,
      revenueByPlanPromise,
      newMembersTrendPromise,
      statusBreakdownPromise,
      retentionPromise,
    ]);

  // Zero-fill the status breakdown so all four statuses always render, in order.
  const statusCounts = Object.fromEntries(statusRows.rows.map((r) => [r.status, r.count]));
  const status_breakdown = MEMBER_STATUSES.map((status) => ({
    status,
    count: statusCounts[status] || 0,
  }));

  return ok(res, {
    kpis,
    revenue_trend: revenueTrend.rows,
    revenue_by_plan: revenueByPlan.rows,
    new_members_trend: newMembersTrend.rows,
    status_breakdown,
    retention,
  });
}

module.exports = { getDashboard };
