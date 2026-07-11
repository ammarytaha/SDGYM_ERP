// Subscriptions API (Phase 2). Reads are open to all roles; create + the
// freeze/unfreeze/cancel actions are owner + front_desk (backend enforces).
//
// listForMember() -> [ subscription, ... ] (each joined with its plan + is_expired)
// create()        -> the created subscription
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
};
