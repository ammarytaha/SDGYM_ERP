# Saad Gym ERP

Gym management system for Saad Gym — members, membership billing, QR check-in,
and WhatsApp notifications. Arabic, RTL, tablet-first for the front desk.

- **Spec:** [`GYM_ERP_SPEC.md`](./GYM_ERP_SPEC.md)
- **Design system:** [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md)
- **Conventions:** [`CLAUDE.md`](./CLAUDE.md) · backend details in [`backend/README.md`](./backend/README.md)

## Structure

```
backend/    Express + PostgreSQL REST API (node-pg-migrate, JWT auth)
frontend/   React app (Vite), Arabic RTL, design-system tokens
```

Stack: React · Node.js + Express · PostgreSQL · JWT auth. Built phase-by-phase
per `GYM_ERP_SPEC.md` §9. **Current status: Phase 0 (scaffold) complete.**

## Getting started

**Prerequisites:** Node.js ≥ 20, PostgreSQL running locally.

### Backend

```bash
cd backend
npm install
cp .env.example .env                 # then set a real JWT_SECRET
createdb saad_gym                    # one-time
npm run migrate:up                   # create the users table
npm run create-admin -- "Saad Owner" owner@saadgym.test "changeme123" owner
npm run dev                          # http://localhost:4000
```

Verify: `curl http://localhost:4000/api/health` → `{"success":true,"data":{"status":"ok","db":"up",...}}`

### Frontend

```bash
cd frontend
npm install
npm run dev                          # http://localhost:5173
```

See [`backend/README.md`](./backend/README.md) for the full script list and code
conventions.
