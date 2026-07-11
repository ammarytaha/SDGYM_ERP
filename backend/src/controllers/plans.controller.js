'use strict';

// Membership plans CRUD (spec §4/§6). Writes are owner-only (enforced on the
// route). Validated input arrives on req.valid.{body,query,params}.

const { query } = require('../config/db');
const AppError = require('../utils/AppError');
const { ok } = require('../utils/apiResponse');

const PLAN_COLUMNS = 'id, name, duration_days, price, active, created_at';

// Unique-name violation -> a clean 409 instead of a raw 500.
function asNameConflict(err) {
  if (err.code === '23505') {
    return new AppError('A plan with this name already exists.', 409, 'PLAN_NAME_TAKEN');
  }
  return err;
}

/** GET /api/plans?active=true|false */
async function listPlans(req, res) {
  const { active } = req.valid.query;

  const params = [];
  let where = '';
  if (active === 'true' || active === 'false') {
    params.push(active === 'true');
    where = `WHERE active = $${params.length}`;
  }

  // Active plans first, then cheapest first — the order the picker wants.
  const result = await query(
    `SELECT ${PLAN_COLUMNS} FROM membership_plans ${where} ORDER BY active DESC, price ASC, id ASC`,
    params
  );
  return ok(res, { plans: result.rows });
}

/** POST /api/plans (owner) */
async function createPlan(req, res) {
  const { name, duration_days, price, active } = req.valid.body;
  try {
    const result = await query(
      `INSERT INTO membership_plans (name, duration_days, price, active)
       VALUES ($1, $2, $3, $4)
       RETURNING ${PLAN_COLUMNS}`,
      [name, duration_days, price, active]
    );
    return ok(res, { plan: result.rows[0] }, 201);
  } catch (err) {
    throw asNameConflict(err);
  }
}

/** PATCH /api/plans/:id (owner) — edit fields or retire via active=false */
async function updatePlan(req, res) {
  const { id } = req.valid.params;
  const body = req.valid.body;

  const sets = [];
  const params = [];
  for (const field of ['name', 'duration_days', 'price', 'active']) {
    if (field in body) {
      params.push(body[field]);
      sets.push(`${field} = $${params.length}`);
    }
  }
  if (sets.length === 0) throw new AppError('Provide at least one field to update.', 400, 'NO_FIELDS');

  params.push(id);
  try {
    const result = await query(
      `UPDATE membership_plans SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING ${PLAN_COLUMNS}`,
      params
    );
    const plan = result.rows[0];
    if (!plan) throw new AppError('Plan not found.', 404, 'PLAN_NOT_FOUND');
    return ok(res, { plan });
  } catch (err) {
    throw asNameConflict(err);
  }
}

module.exports = { listPlans, createPlan, updatePlan };
