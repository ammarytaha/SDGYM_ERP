'use strict';

// Phase 0 smoke test. Self-contained and repeatable:
//   npm run smoke
// It boots the Express app in-process on an ephemeral port, seeds a temporary
// user, exercises the health check + JWT auth flow, asserts each result, then
// deletes the temp user and shuts down. Exits non-zero if any check fails.
//
// Requires: Postgres running and migrations applied (npm run migrate:up).

const assert = require('node:assert/strict');
const app = require('../src/app');
const { pool, query } = require('../src/config/db');
const { hashPassword } = require('../src/utils/password');

let passed = 0;
function check(name, condition) {
  assert.ok(condition, name);
  console.log(`  ✓ ${name}`);
  passed += 1;
}

async function json(res) {
  return { status: res.status, body: await res.json() };
}

(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const email = `smoke_${Date.now()}@example.test`;
  const password = 'smoke-pass-123';
  let tempUserId;

  console.log(`\nRunning Phase 0 smoke test against ${base}\n`);

  try {
    // Seed a throwaway user so the test doesn't depend on manual seeding.
    const hash = await hashPassword(password);
    const seed = await query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      ['Smoke Test User', email, hash, 'front_desk']
    );
    tempUserId = seed.rows[0].id;

    // 1) Health check reaches the DB.
    let r = await json(await fetch(`${base}/api/health`));
    check('GET /api/health returns 200', r.status === 200);
    check('health reports db "up"', r.body.success === true && r.body.data.db === 'up');

    // 2) Login with correct credentials returns a token.
    r = await json(
      await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
    );
    check('POST /api/auth/login returns 200', r.status === 200);
    check('login returns a JWT token', typeof r.body.data.token === 'string' && r.body.data.token.length > 20);
    check('login returns the correct user', r.body.data.user.email === email);
    const token = r.body.data.token;

    // 3) /me with a valid token returns the user.
    r = await json(await fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } }));
    check('GET /api/auth/me (with token) returns 200', r.status === 200);
    check('/me returns the authenticated user', r.body.data.user.email === email);

    // 4) /me without a token is rejected.
    r = await json(await fetch(`${base}/api/auth/me`));
    check('GET /api/auth/me (no token) returns 401', r.status === 401);
    check('401 uses the error envelope', r.body.success === false && r.body.error.code === 'AUTH_REQUIRED');

    // 5) Wrong password is rejected with a generic message (no user enumeration).
    r = await json(
      await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'wrong-password' }),
      })
    );
    check('login with wrong password returns 401', r.status === 401);
    check('wrong password message is generic', r.body.error.message === 'Invalid email or password.');

    // 6) Unknown route returns the 404 envelope.
    r = await json(await fetch(`${base}/api/does-not-exist`));
    check('unknown route returns 404 envelope', r.status === 404 && r.body.error.code === 'NOT_FOUND');

    console.log(`\n✅ PASSED — all ${passed} checks green.\n`);
  } catch (err) {
    console.error(`\n❌ FAILED after ${passed} passing check(s): ${err.message}\n`);
    process.exitCode = 1;
  } finally {
    if (tempUserId) {
      await query('DELETE FROM users WHERE id = $1', [tempUserId]);
    }
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
})();
