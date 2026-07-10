'use strict';

// Entry point. Verify the database is reachable *before* we start accepting
// requests, so a misconfigured/unreachable DB fails loudly on boot rather than
// surfacing as confusing errors on the first request.

const config = require('./src/config/env');
const app = require('./src/app');
const { pool, checkConnection } = require('./src/config/db');

async function start() {
  try {
    await checkConnection();
    // eslint-disable-next-line no-console
    console.log('[db] Connected to Postgres.');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[db] Could not connect to Postgres:', err.message);
    console.error('     Check DATABASE_URL in .env and that Postgres is running.');
    process.exit(1);
  }

  const server = app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[server] Saad Gym API listening on http://localhost:${config.port} (${config.env})`);
  });

  // Graceful shutdown: stop accepting connections, then drain the pool.
  const shutdown = (signal) => {
    // eslint-disable-next-line no-console
    console.log(`\n[server] ${signal} received — shutting down...`);
    server.close(async () => {
      await pool.end();
      // eslint-disable-next-line no-console
      console.log('[server] Closed. Bye.');
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start();
