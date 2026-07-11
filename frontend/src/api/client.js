// Thin fetch wrapper for the Express API. Responsibilities:
//  - prepend the `/api` base (Vite proxies it to the backend in dev)
//  - attach the Bearer token when present
//  - unwrap the backend envelope: success -> data; failure -> throw ApiError
//  - on 401, clear the stored session and signal the app to log out
//
// Keeping this deliberately small (no axios / react-query) — see the Phase 1b-i
// plan. Callers use the per-module clients (api/auth.js, api/members.js).

const BASE = '/api';
const TOKEN_KEY = 'saadgym_token';

export class ApiError extends Error {
  constructor(message, { code, status } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(method, path, { body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const token = getToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // Network/connection failure — the server is unreachable.
    throw new ApiError('تعذّر الاتصال بالخادم. تحقّق من اتصالك وحاول مجددًا.', {
      code: 'NETWORK_ERROR',
    });
  }

  // Every endpoint returns JSON; tolerate an empty body just in case.
  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok || !payload || payload.success === false) {
    const apiErr = (payload && payload.error) || {};

    // Token missing/expired/invalid: drop the session and tell the app to route
    // back to login (AuthContext listens for this event).
    if (res.status === 401) {
      setToken(null);
      window.dispatchEvent(new Event('auth:logout'));
    }

    throw new ApiError(apiErr.message || 'حدث خطأ غير متوقع.', {
      code: apiErr.code,
      status: res.status,
    });
  }

  return payload.data;
}

export const api = {
  get: (path, opts) => request('GET', path, opts),
  post: (path, body, opts) => request('POST', path, { ...opts, body }),
  patch: (path, body, opts) => request('PATCH', path, { ...opts, body }),
};
