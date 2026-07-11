'use strict';

// Demo seed for the Members list screen (Phase 1b-i). Inserts a set of sample
// members with varied statuses so search, status filtering, and pagination all
// have data to exercise. Safe to re-run: existing phones are skipped
// (ON CONFLICT (phone) DO NOTHING).
//
//   npm run seed:members
//
// Requires: Postgres running and migrations applied (npm run migrate:up).

const crypto = require('node:crypto');
const { pool, query } = require('../src/config/db');

// 12 members → with a page size of 10 the list pages into 2, so pagination is
// visible in the demo. Mix of statuses covers every badge color.
const SAMPLE_MEMBERS = [
  { full_name: 'أحمد محمد سعيد', phone: '01000000001', status: 'active', joined_at: '2026-01-05' },
  { full_name: 'محمود علي حسن', phone: '01000000002', status: 'active', joined_at: '2026-02-11' },
  { full_name: 'سارة إبراهيم عبد الرحمن', phone: '01000000003', status: 'frozen', joined_at: '2026-03-01' },
  { full_name: 'منى عبد الله', phone: '01000000004', status: 'expired', joined_at: '2025-11-20' },
  { full_name: 'خالد فوزي', phone: '01000000005', status: 'active', joined_at: '2026-04-18' },
  { full_name: 'ياسمين حاتم', phone: '01000000006', status: 'cancelled', joined_at: '2025-09-14' },
  { full_name: 'عمر الشريف', phone: '01000000007', status: 'active', joined_at: '2026-05-02' },
  { full_name: 'ندى كمال', phone: '01000000008', status: 'frozen', joined_at: '2026-05-22' },
  { full_name: 'حسام الدين طارق', phone: '01000000009', status: 'active', joined_at: '2026-06-10' },
  { full_name: 'ليلى مصطفى', phone: '01000000010', status: 'expired', joined_at: '2025-12-30' },
  { full_name: 'كريم وائل', phone: '01000000011', status: 'active', joined_at: '2026-06-25' },
  { full_name: 'فاطمة الزهراء عادل', phone: '01000000012', status: 'active', joined_at: '2026-07-01' },
];

(async () => {
  let inserted = 0;
  try {
    for (const m of SAMPLE_MEMBERS) {
      const res = await query(
        `INSERT INTO members (full_name, phone, status, joined_at, qr_code_token)
         VALUES ($1, $2, $3::member_status, $4::date, $5)
         ON CONFLICT (phone) DO NOTHING
         RETURNING id`,
        [m.full_name, m.phone, m.status, m.joined_at, crypto.randomUUID()]
      );
      if (res.rowCount > 0) inserted += 1;
    }
    const total = await query('SELECT count(*)::int AS n FROM members');
    console.log(
      `✅ Seeded ${inserted} new member(s) (skipped ${SAMPLE_MEMBERS.length - inserted} existing). ` +
        `Members table now holds ${total.rows[0].n} row(s).`
    );
  } catch (err) {
    console.error(`❌ Seed failed: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
