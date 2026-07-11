// Membership plans API (Phase 2). Reads are open to all roles; create/update are
// owner-only (backend enforces — the UI just hides the controls).
//
// list()   -> [ plan, ... ]
// create() -> the created plan
// update() -> the updated plan
import { api } from './client';

export const plansApi = {
  list: async ({ active } = {}) => {
    const params = new URLSearchParams();
    if (active === true) params.set('active', 'true');
    if (active === false) params.set('active', 'false');
    const qs = params.toString();
    const { plans } = await api.get(`/plans${qs ? `?${qs}` : ''}`);
    return plans;
  },

  create: async (payload) => {
    const { plan } = await api.post('/plans', payload);
    return plan;
  },

  update: async (id, payload) => {
    const { plan } = await api.patch(`/plans/${id}`, payload);
    return plan;
  },
};
