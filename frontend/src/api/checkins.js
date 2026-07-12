// Check-ins API (Phase 4). Recording a check-in is owner + front_desk (the kiosk);
// reading the log is open to all roles (backend enforces).
//
// create() -> { result, reason, already_today, member, checkin }
// list()   -> [ checkin, ... ]
import { api } from './client';

export const checkinsApi = {
  // Pass exactly one of { qr_code_token } (scan) or { member_id } (manual).
  create: async (payload) => api.post('/checkins', payload),

  list: async ({ date, member_id } = {}) => {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (member_id) params.set('member_id', String(member_id));
    const qs = params.toString();
    const { checkins } = await api.get(`/checkins${qs ? `?${qs}` : ''}`);
    return checkins;
  },
};
