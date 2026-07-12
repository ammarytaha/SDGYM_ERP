// Subscriptions API (Phase 2). Reads are open to all roles; create + the
// freeze/unfreeze/cancel actions are owner + front_desk (backend enforces).
//
// listForMember() -> [ subscription, ... ] (each joined with its plan + is_expired)
// create()        -> the created subscription. Accepts an optional `payment`
//                    ({ amount, method, notes? }) recorded atomically with it (Phase 3).
// patch()         -> the updated subscription (action = freeze|unfreeze|cancel)
import { api } from './client';

export const subscriptionsApi = {
  listForMember: async (memberId) => {
    const { subscriptions } = await api.get(`/members/${memberId}/subscriptions`);
    return subscriptions;
  },

  create: async (payload) => {
    const { subscription } = await api.post('/subscriptions', payload);
    return subscription;
  },

  patch: async (id, action, extra = {}) => {
    const { subscription } = await api.patch(`/subscriptions/${id}`, { action, ...extra });
    return subscription;
  },

  // Follow-up lists for the front desk (Phase 3b): subscriptions due for renewal
  // within `within` days, and current subscriptions with an outstanding balance.
  attention: async ({ within } = {}) => {
    const qs = within ? `?within=${within}` : '';
    return api.get(`/subscriptions/attention${qs}`); // -> { renewals, dues }
  },
};
