// Members API calls. The list (read) landed in Phase 1b-i; the profile + form
// screens in 1b-ii add the single-member read, QR fetch, and the write side
// (create / update).
//
// list()   -> { members: [...], pagination: { page, limit, total, total_pages } }
// get()    -> member object
// getQr()  -> { token, qr_data_url }
// create() -> the newly created member
// update() -> the updated member
import { api } from './client';

export const membersApi = {
  list: ({ search, status, page, limit } = {}) => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    if (page) params.set('page', String(page));
    if (limit) params.set('limit', String(limit));
    const qs = params.toString();
    return api.get(`/members${qs ? `?${qs}` : ''}`);
  },

  // GET /members/:id -> { member }; unwrap to the member for the caller.
  get: async (id) => {
    const { member } = await api.get(`/members/${id}`);
    return member;
  },

  // GET /members/:id/qr -> { token, qr_data_url } (a ready-to-render data URL).
  getQr: (id) => api.get(`/members/${id}/qr`),

  // POST /members -> { member }; returns the created member (has the new id).
  create: async (payload) => {
    const { member } = await api.post('/members', payload);
    return member;
  },

  // PATCH /members/:id -> { member }; returns the updated member.
  update: async (id, payload) => {
    const { member } = await api.patch(`/members/${id}`, payload);
    return member;
  },
};
