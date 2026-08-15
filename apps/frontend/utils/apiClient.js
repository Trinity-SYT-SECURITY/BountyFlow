/**
 * One place that decides how this app talks to the backend.
 *
 * Two problems this solves, both of which produced pages that looked empty
 * while the dashboard counters showed data:
 *
 *   1. About a dozen pages called fetch() without an Authorization header.
 *      That worked only because the API accepted anonymous callers; the moment
 *      REQUIRE_AUTH is on, those pages get 401 and render "No projects found"
 *      next to a dashboard that says 2 projects.
 *
 *   2. Every call was hardcoded to http://localhost:8002, so the UI only worked
 *      when the browser happened to sit on the same machine as the backend.
 *
 * Rather than edit 60 call sites, we install one fetch wrapper at app start:
 * backend URLs are rewritten to same-origin /api/... (next.config.js already
 * proxies that to BACKEND_URL) and the bearer token is attached automatically.
 */

const LEGACY_BACKEND = /^https?:\/\/(localhost|127\.0\.0\.1):8002/;

export function getToken() {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem('token');
  } catch {
    return null;
  }
}

/** Headers for a JSON API call, including the bearer token when we have one. */
export function authHeaders(extra = {}) {
  const headers = { 'Content-Type': 'application/json', ...extra };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function normaliseUrl(url) {
  if (typeof url !== 'string') return url;
  // absolute backend URL -> same-origin path, so the Next proxy handles it
  if (LEGACY_BACKEND.test(url)) return url.replace(LEGACY_BACKEND, '');
  return url;
}

function isOurApi(url) {
  // /health is the header's connection probe; next.config.js proxies it too
  return typeof url === 'string'
    && (url.startsWith('/api/') || url.startsWith('/health') || LEGACY_BACKEND.test(url));
}

let installed = false;

/** Wrap window.fetch once, at app start. Safe to call repeatedly. */
export function installApiClient() {
  if (installed || typeof window === 'undefined' || !window.fetch) return;
  const original = window.fetch.bind(window);

  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input && input.url;
    if (!isOurApi(url)) return original(input, init);

    const nextInit = { ...init };
    const headers = new Headers(nextInit.headers || (typeof input !== 'string' ? input.headers : undefined));
    const token = getToken();
    if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
    if (nextInit.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    nextInit.headers = headers;

    return original(normaliseUrl(url), nextInit);
  };

  installed = true;
}

/** Explicit helper for new code: apiFetch('/api/v1/projects/') */
export async function apiFetch(path, init = {}) {
  const res = await fetch(path, { ...init, headers: authHeaders(init.headers) });
  return res;
}
