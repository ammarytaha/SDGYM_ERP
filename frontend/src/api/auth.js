// Auth API calls. Shapes match backend/src/controllers/auth.controller.js:
//   login -> { token, user: { id, name, email, role } }
//   me    -> { user }
import { api } from './client';

export const authApi = {
  // Public endpoint — don't send a (possibly stale) token.
  login: (email, password) =>
    api.post('/auth/login', { email, password }, { auth: false }),

  me: () => api.get('/auth/me'),

  logout: () => api.post('/auth/logout', {}),
};
