// Payments API (Phase 3). Reads are open to all roles; create is owner +
// front_desk (backend enforces — the UI just hides the control).
//
// listForMember() -> [ payment, ... ] (each joined with its plan_name)
// create()        -> the created payment
import { api } from './client';

export const paymentsApi = {
  listForMember: async (memberId) => {
    const { payments } = await api.get(`/members/${memberId}/payments`);
    return payments;
  },

  create: async (payload) => {
    const { payment } = await api.post('/payments', payload);
    return payment;
  },
};
