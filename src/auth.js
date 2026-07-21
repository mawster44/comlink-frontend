export function getToken() { return localStorage.getItem('comlink_token'); }
export function setToken(t) { localStorage.setItem('comlink_token', t); }
export function clearToken() { localStorage.removeItem('comlink_token'); }

const API_BASE = import.meta.env.VITE_API_URL || '';

export async function apiFetch(path, opts = {}) {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
  });
  if (res.status === 401) {
    clearToken();
    window.location.href = '/login';
    return null;
  }
  return res;
}
