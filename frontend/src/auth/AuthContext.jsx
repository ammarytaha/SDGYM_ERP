// Auth state for the whole app. Holds the current { token, user }, persists the
// token in localStorage (via api/client), and restores the session on load by
// validating the stored token against GET /api/auth/me.
//
// Security note (per the Phase 1b-i plan): localStorage is the pragmatic match
// to the backend's Bearer JWT but is XSS-exposed; httpOnly cookies are the later
// hardening path (needs backend changes) — out of scope for MVP.
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import { authApi } from '../api/auth';
import { getToken, setToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setTokenState] = useState(getToken());
  const [loading, setLoading] = useState(true);

  const clearSession = useCallback(() => {
    setToken(null);
    setTokenState(null);
    setUser(null);
  }, []);

  // On load: if a token is stored, confirm it's still valid and load the user.
  useEffect(() => {
    let active = true;
    async function restore() {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const { user: me } = await authApi.me();
        if (active) setUser(me);
      } catch {
        // Invalid/expired token — drop it.
        if (active) clearSession();
      } finally {
        if (active) setLoading(false);
      }
    }
    restore();
    return () => {
      active = false;
    };
  }, [clearSession]);

  // A 401 anywhere (api/client) dispatches 'auth:logout' → tear the session down.
  useEffect(() => {
    const onLogout = () => clearSession();
    window.addEventListener('auth:logout', onLogout);
    return () => window.removeEventListener('auth:logout', onLogout);
  }, [clearSession]);

  const login = useCallback(async (email, password) => {
    const { token: tok, user: usr } = await authApi.login(email, password);
    setToken(tok);
    setTokenState(tok);
    setUser(usr);
    return usr;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Logout is best-effort; the client discards the token regardless.
    }
    clearSession();
  }, [clearSession]);

  const value = {
    user,
    token,
    loading,
    isAuthenticated: Boolean(token),
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
