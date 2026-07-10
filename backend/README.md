# Saad Gym ERP — Backend

Express + PostgreSQL REST API. This document is the **conventions reference**
(spec §9). Read it before adding a module.

## Setup

```bash
cd backend
npm install
cp .env.example .env          # then set a real JWT_SECRET
createdb saad_gym             # one-time, uses your local postgres role
npm run migrate:up            # apply migrations
npm run create-admin -- "Saad Owner" owner@saadgym.test "yourpassword" owner
npm run dev                   # start with auto-reload (nodemon)
```

Health check: `GET http://localhost:4000/api/health`.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start with nodemon (auto-reload) |
| `npm start` | Start once (`node server.js`) |
| `npm run migrate:up` | Apply pending migrations |
| `npm run migrate:down` | Roll back the last migration |
| `npm run migrate -- create <name>` | Scaffold a new migration file |
| `npm run create-admin -- "Name" email pw [role]` | Provision a staff account |

## Project layout

```
src/
  config/      env.js (validated config), db.js (pg pool + query + checkConnection)
  middleware/  auth.js (requireAuth, requireRole), errorHandler.js (notFound, errorHandler)
  utils/       jwt.js, password.js (bcryptjs), apiResponse.js, AppError.js, asyncHandler.js
  controllers/ one file per module (auth.controller.js)
  routes/      one router per module, mounted in routes/index.js under /api
  app.js       express wiring (helmet, cors, json, morgan, routes, error handling)
server.js      entry point: verify DB, then listen
migrations/    node-pg-migrate files (numeric-timestamp prefix = order)
scripts/       one-off CLIs (create-admin.js)
```

## Conventions (follow these in every phase)

- **Module system:** CommonJS (`require` / `module.exports`).
- **Response envelope:** always `ok(res, data[, status])` or `fail(...)` from
  `utils/apiResponse.js`.
  - Success → `{ "success": true, "data": ... }`
  - Error → `{ "success": false, "error": { "message", "code"? } }`
- **Errors:** throw `new AppError(message, status, code)` for expected failures;
  wrap every async handler in `asyncHandler(...)` so rejections reach the central
  `errorHandler`. Never send a stack trace to the client; unexpected errors are
  logged and returned as a generic 500.
- **Auth:** protect routes with `requireAuth`; gate by role with
  `requireRole('owner', ...)` (per spec §6). Only `/api/auth/login`,
  `/api/auth/logout`, and `/api/health` are public.
- **SQL:** always parameterised (`$1, $2, ...`) via `query()` — never string
  concatenation. Store bcrypt hashes only, never plaintext passwords.
- **Config:** read everything from `config/env.js`; it validates required vars on
  boot and fails fast if they're missing.
- **Emails:** normalise to lowercase/trimmed before insert and lookup.

## Adding a module (later phases)

1. `npm run migrate -- create <table>` and define `up`/`down`.
2. Add `<module>.controller.js` (async fns, throw `AppError`).
3. Add `<module>.routes.js` (wrap handlers in `asyncHandler`, apply auth/role).
4. Mount it in `routes/index.js`.
