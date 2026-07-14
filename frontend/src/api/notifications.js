// Notifications log API (Phase 5). Read-only for all roles (backend enforces).
//
// listForMember() -> [ notification, ... ] for one member
// list()          -> recent notifications across all members
import { api } from './client';

export const notificationsApi = {
  listForMember: async (memberId) => {
    const { notifications } = await api.get(`/notifications/log?member_id=${memberId}`);
    return notifications;
  },

  list: async () => {
    const { notifications } = await api.get('/notifications/log');
    return notifications;
  },
};
