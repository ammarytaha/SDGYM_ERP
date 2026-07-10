'use strict';

// CLI to provision a staff account (there is no public signup).
// Usage:
//   npm run create-admin -- "Full Name" email@example.com password [role]
//   node scripts/create-admin.js "Full Name" email@example.com password [role]
// role defaults to 'owner'. Valid roles: owner | front_desk | trainer.

const { pool, query } = require('../src/config/db');
const { hashPassword } = require('../src/utils/password');

const VALID_ROLES = ['owner', 'front_desk', 'trainer'];

async function main() {
  const [name, email, password, role = 'owner'] = process.argv.slice(2);

  if (!name || !email || !password) {
    console.error('Usage: npm run create-admin -- "Full Name" email@example.com password [role]');
    process.exit(1);
  }
  if (!VALID_ROLES.includes(role)) {
    console.error(`Invalid role "${role}". Valid roles: ${VALID_ROLES.join(', ')}`);
    process.exit(1);
  }

  const normalisedEmail = email.toLowerCase().trim();
  const password_hash = await hashPassword(password);

  try {
    const result = await query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, created_at`,
      [name, normalisedEmail, password_hash, role]
    );
    const user = result.rows[0];
    console.log('Created user:');
    console.log(JSON.stringify(user, null, 2));
  } catch (err) {
    if (err.code === '23505') {
      // unique_violation on email
      console.error(`A user with email "${normalisedEmail}" already exists.`);
    } else {
      console.error('Failed to create user:', err.message);
    }
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
