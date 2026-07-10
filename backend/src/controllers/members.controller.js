'use strict';

// Members CRUD + QR. Validated input arrives on req.valid.{body,query,params}
// (see middleware/validate.js). All SQL is parameterised.

const crypto = require('crypto');
const { query } = require('../config/db');
const AppError = require('../utils/AppError');
const { ok } = require('../utils/apiResponse');
const { tokenToDataUrl } = require('../utils/qr');

// Columns returned to clients (everything — no secrets on this table).
const MEMBER_COLUMNS =
  'id, full_name, phone, email, photo_url, joined_at, status, qr_code_token, created_at';

// Fields a client is allowed to change via PATCH. Never id/qr_code_token/created_at.
const UPDATABLE_FIELDS = ['full_name', 'phone', 'email', 'photo_url', 'status', 'joined_at'];

// Duplicate phone (unique violation) -> a clean 409 instead of a raw 500.
function asPhoneConflict(err) {
  if (err.code === '23505') {
    return new AppError('A member with this phone number already exists.', 409, 'PHONE_TAKEN');
  }
  return err;
}

/**
 * GET /api/members
 * Query: search, status, page, limit (validated + defaulted).
 */
async function listMembers(req, res) {
  const { search, status, page, limit } = req.valid.query;

  const conditions = [];
  const params = [];

  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}::member_status`);
  }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(full_name ILIKE $${params.length} OR phone ILIKE $${params.length})`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(`SELECT COUNT(*)::int AS total FROM members ${where}`, params);
  const total = countResult.rows[0].total;

  const offset = (page - 1) * limit;
  const listParams = [...params, limit, offset];
  const listResult = await query(
    `SELECT ${MEMBER_COLUMNS} FROM members ${where}
     ORDER BY created_at DESC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );

  return ok(res, {
    members: listResult.rows,
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
}

/** GET /api/members/:id */
async function getMember(req, res) {
  const { id } = req.valid.params;
  const result = await query(`SELECT ${MEMBER_COLUMNS} FROM members WHERE id = $1`, [id]);
  const member = result.rows[0];
  if (!member) throw new AppError('Member not found.', 404, 'MEMBER_NOT_FOUND');
  return ok(res, { member });
}

/** POST /api/members */
async function createMember(req, res) {
  const { full_name, phone, email, photo_url, status, joined_at } = req.valid.body;
  const qrCodeToken = crypto.randomUUID();

  try {
    const result = await query(
      `INSERT INTO members
         (full_name, phone, email, photo_url, status, joined_at, qr_code_token)
       VALUES ($1, $2, $3, $4, $5::member_status, COALESCE($6::date, current_date), $7)
       RETURNING ${MEMBER_COLUMNS}`,
      [full_name, phone, email ?? null, photo_url ?? null, status, joined_at ?? null, qrCodeToken]
    );
    return ok(res, { member: result.rows[0] }, 201);
  } catch (err) {
    throw asPhoneConflict(err);
  }
}

/** PATCH /api/members/:id */
async function updateMember(req, res) {
  const { id } = req.valid.params;
  const body = req.valid.body;

  const sets = [];
  const params = [];
  for (const field of UPDATABLE_FIELDS) {
    if (field in body) {
      params.push(body[field]);
      const cast = field === 'status' ? '::member_status' : field === 'joined_at' ? '::date' : '';
      sets.push(`${field} = $${params.length}${cast}`);
    }
  }
  // The zod schema guarantees ≥1 field, but guard defensively.
  if (sets.length === 0) throw new AppError('Provide at least one field to update.', 400, 'NO_FIELDS');

  params.push(id);
  try {
    const result = await query(
      `UPDATE members SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING ${MEMBER_COLUMNS}`,
      params
    );
    const member = result.rows[0];
    if (!member) throw new AppError('Member not found.', 404, 'MEMBER_NOT_FOUND');
    return ok(res, { member });
  } catch (err) {
    throw asPhoneConflict(err);
  }
}

/** GET /api/members/:id/qr */
async function getMemberQr(req, res) {
  const { id } = req.valid.params;
  const result = await query('SELECT qr_code_token FROM members WHERE id = $1', [id]);
  const row = result.rows[0];
  if (!row) throw new AppError('Member not found.', 404, 'MEMBER_NOT_FOUND');

  const qrDataUrl = await tokenToDataUrl(row.qr_code_token);
  return ok(res, { token: row.qr_code_token, qr_data_url: qrDataUrl });
}

module.exports = { listMembers, getMember, createMember, updateMember, getMemberQr };
