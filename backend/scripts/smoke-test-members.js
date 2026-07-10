'use strict';

// Phase 1a smoke test for the members module. Self-contained and repeatable:
//   npm run smoke:members
// Boots the app in-process on an ephemeral port, seeds a temp owner + trainer,
// exercises the members API (CRUD, QR, validation, role gating), then deletes
// everything it created. Exits non-zero if any check fails.
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
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, $4) RETURNING id`,
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

  const phone = `0100${Date.now().toString().slice(-7)}`;
  const createdUserIds = [];
  let memberId;

  console.log(`\nRunning Phase 1a members smoke test against ${base}\n`);

  try {
    const owner = await seedUser('owner');
    const trainer = await seedUser('trainer');
    createdUserIds.push(owner.id, trainer.id);

    // 1) Create (as owner)
    let r = await req(base, 'POST', '/api/members', owner.token, {
      full_name: 'أحمد محمد',
      phone,
      email: 'Ahmed@Example.com',
      status: 'active',
    });
    check('POST /api/members (owner) returns 201', r.status === 201);
    check('created member has a qr_code_token', typeof r.body.data.member.qr_code_token === 'string');
    check('email was normalised to lowercase', r.body.data.member.email === 'ahmed@example.com');
    check('joined_at defaulted to a date', !!r.body.data.member.joined_at);
    memberId = r.body.data.member.id;

    // 2) Duplicate phone -> 409
    r = await req(base, 'POST', '/api/members', owner.token, { full_name: 'Someone Else', phone });
    check('duplicate phone returns 409 PHONE_TAKEN', r.status === 409 && r.body.error.code === 'PHONE_TAKEN');

    // 3) Invalid body -> 400
    r = await req(base, 'POST', '/api/members', owner.token, { phone: '01099998888' });
    check('missing full_name returns 400 VALIDATION_ERROR', r.status === 400 && r.body.error.code === 'VALIDATION_ERROR');

    // 4) List with filters + pagination
    r = await req(base, 'GET', `/api/members?search=${encodeURIComponent('أحمد')}&status=active&limit=10`, owner.token);
    check('GET list returns 200', r.status === 200);
    check('list includes the created member', r.body.data.members.some((m) => m.id === memberId));
    check('list has a pagination block', r.body.data.pagination && r.body.data.pagination.limit === 10);

    // 5) Get by id (found + not found)
    r = await req(base, 'GET', `/api/members/${memberId}`, owner.token);
    check('GET /:id returns the member', r.status === 200 && r.body.data.member.id === memberId);
    r = await req(base, 'GET', '/api/members/999999999', owner.token);
    check('GET unknown id returns 404', r.status === 404 && r.body.error.code === 'MEMBER_NOT_FOUND');

    // 6) Patch
    r = await req(base, 'PATCH', `/api/members/${memberId}`, owner.token, { status: 'frozen' });
    check('PATCH status -> frozen returns 200', r.status === 200 && r.body.data.member.status === 'frozen');

    // 7) QR
    r = await req(base, 'GET', `/api/members/${memberId}/qr`, owner.token);
    check('GET /:id/qr returns token + data url', r.status === 200 && typeof r.body.data.token === 'string');
    check('qr_data_url is a PNG data URL', r.body.data.qr_data_url.startsWith('data:image/png;base64,'));

    // 8) Role gating — trainer is read-only
    r = await req(base, 'POST', '/api/members', trainer.token, { full_name: 'Trainer Made', phone: '01055554444' });
    check('POST as trainer returns 403 FORBIDDEN', r.status === 403 && r.body.error.code === 'FORBIDDEN');
    r = await req(base, 'GET', '/api/members', trainer.token);
    check('GET as trainer returns 200 (read-only allowed)', r.status === 200);

    // 9) Unauthenticated is rejected
    r = await req(base, 'GET', '/api/members', null);
    check('GET without token returns 401', r.status === 401);

    console.log(`\n✅ PASSED — all ${passed} checks green.\n`);
  } catch (err) {
    console.error(`\n❌ FAILED after ${passed} passing check(s): ${err.message}\n`);
    process.exitCode = 1;
  } finally {
    if (memberId) await query('DELETE FROM members WHERE id = $1', [memberId]);
    if (createdUserIds.length) await query('DELETE FROM users WHERE id = ANY($1)', [createdUserIds]);
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
})();
