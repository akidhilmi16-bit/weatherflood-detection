// data.gov.my API client (Weather + Flood Warning).
// The API allows 4 requests/minute per IP, so every response is cached in
// localStorage and reused until it expires. If the API refuses (429) or is
// down, we fall back to the last cached copy and flag it as stale.

const BASE = 'https://api.data.gov.my';

export const ENDPOINTS = {
  forecast: { path: '/weather/forecast/', query: {}, ttl: 60 * 60 * 1000 },
  warnings: { path: '/weather/warning/', query: { sort: '-warning_issue__issued', limit: 200 }, ttl: 10 * 60 * 1000 },
  earthquakes: { path: '/weather/warning/earthquake/', query: { sort: '-utcdatetime', limit: 500 }, ttl: 10 * 60 * 1000 },
  // JPS river-level and rain-gauge stations
  rivers: { path: '/flood-warning/', query: {}, ttl: 15 * 60 * 1000 },
  // Live JPS river levels through our own proxy (netlify/functions/rivers.mjs)
  riversLive: { url: '/api/rivers', query: {}, ttl: 10 * 60 * 1000 },
};

const cacheKey = (name) => `wf-cache:${name}`;

function readCache(name) {
  try {
    const raw = localStorage.getItem(cacheKey(name));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(name, data) {
  try {
    localStorage.setItem(cacheKey(name), JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    // Storage full or blocked (private mode): the app still works, just uncached.
  }
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/**
 * Returns { data, fetchedAt, stale }.
 * `force` skips a fresh cache (used by the refresh button).
 */
export async function fetchEndpoint(name, { force = false } = {}) {
  const ep = ENDPOINTS[name];
  const cached = readCache(name);
  if (!force && cached && Date.now() - cached.savedAt < ep.ttl) {
    return { data: cached.data, fetchedAt: cached.savedAt, stale: false };
  }

  const url = new URL(ep.url ?? BASE + ep.path, window.location.origin);
  for (const [k, v] of Object.entries(ep.query)) url.searchParams.set(k, v);

  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new ApiError(
        res.status === 429 ? 'Rate limit reached (4 requests/minute). Try again in a minute.' : `API error ${res.status}`,
        res.status,
      );
    }
    const data = await res.json();
    writeCache(name, data);
    return { data, fetchedAt: Date.now(), stale: false };
  } catch (err) {
    if (cached) return { data: cached.data, fetchedAt: cached.savedAt, stale: true, error: err.message };
    throw err;
  }
}
