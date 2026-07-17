// Dashboard API (Phase 6). One owner-only read that returns the whole dashboard
// payload: { kpis, revenue_trend, revenue_by_plan, new_members_trend,
// status_breakdown, retention }. The backend enforces the owner-only gate.
import { api } from './client';

export const dashboardApi = {
  get: async () => api.get('/dashboard'),
};
