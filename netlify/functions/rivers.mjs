// GET /api/rivers: live JPS river levels as JSON (see ../jps.mjs).
// Netlify's CDN keeps the answer for 15 minutes and shares it between all
// visitors, so JPS is asked a few times an hour, never once per visitor.

import { fetchAllStations } from '../jps.mjs';

const FRESH_MS = 15 * 60 * 1000;
let memo = null; // last good answer, reused while this function instance stays warm

// A state that failed this time keeps its stations from the last good fetch.
function mergeWithPrevious(data, prev) {
  if (!prev) return data;
  const failed = Object.keys(data.states).filter((s) => typeof data.states[s] === 'string');
  const kept = prev.stations.filter((s) => failed.includes(s.state));
  return { ...data, stations: [...data.stations, ...kept], reused: failed.filter((s) => kept.some((k) => k.state === s)) };
}

export default async function handler() {
  if (!memo || Date.now() - memo.at > FRESH_MS) {
    const data = mergeWithPrevious(await fetchAllStations(), memo?.data);
    if (data.stations.length) {
      memo = { at: Date.now(), data };
    } else {
      // Layout change or JPS down: shows up in the Netlify function log.
      console.error('JPS parse returned no stations', data.states);
      return Response.json({ ...data, error: 'No stations parsed from JPS' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
    }
  }
  return Response.json(memo.data, {
    headers: {
      'Cache-Control': 'public, max-age=300',
      'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=900, stale-while-revalidate=3600',
    },
  });
}

export const config = { path: '/api/rivers' };
