'use strict';

// Single shared Postgres connection pool for the whole app. Import `query`
// for one-off statements; import `pool` when you need a transaction/client.

const { Pool } = require('pg');
const config = require('./env');

const pool = new Pool({
  connectionString: config.databaseUrl,
});

// Surface unexpected errors on idle clients instead of crashing silently.
pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('[db] Unexpected error on idle Postgres client:', err.message);
});

/**
 * Run a parameterised query against the pool.
 * Always use $1, $2, ... placeholders — never string-concatenate user input.
 * @param {string} text SQL text with $n placeholders
 * @param {Array} [params] Parameter values
 * @returns {Promise<import('pg').QueryResult>}
 */
function query(text, params) {
  return pool.query(text, params);
}

/**
 * Run `fn` inside a single transaction. Acquires a dedicated client, BEGINs,
 * COMMITs on success, ROLLBACKs on any throw, and always releases the client.
 * Use for multi-statement writes that must be atomic (e.g. creating a
 * subscription and syncing members.status together).
 * @template T
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn Receives the txn client
 * @returns {Promise<T>}
 */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Swallow rollback errors — surface the original failure instead.
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Verify the database is reachable. Called on boot so we fail loudly if the
 * DB is down, and reused by the /api/health endpoint.
 * @returns {Promise<boolean>} true if SELECT 1 succeeds
 */
async function checkConnection() {
  const result = await pool.query('SELECT 1 AS ok');
  return result.rows[0].ok === 1;
}

module.exports = { pool, query, withTransaction, checkConnection };
