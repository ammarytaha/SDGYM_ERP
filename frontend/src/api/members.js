// Members API calls. Phase 1b-i only needs the list (read). get/create/update
// land in 1b-ii alongside the profile + form screens.
//
// list() -> { members: [...], pagination: { page, limit, total, total_pages } }
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
};
