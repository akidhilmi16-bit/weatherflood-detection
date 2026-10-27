// Reads live river levels from JPS Public Infobanjir, the source behind the
// frozen data.gov.my /flood-warning/ feed. The site has no API: each state
// page is a server-built HTML table, so we parse that table.
//
// Not an official API. If JPS changes the page layout, parsing returns no
// rows; the function then answers 502 and the app falls back to data.gov.my.

export const STATES = [
  'Perlis',
  'Kedah',
  'Pulau Pinang',
  'Perak',
  'Selangor',
  'Wilayah Persekutuan Kuala Lumpur',
  'Negeri Sembilan',
  'Melaka',
  'Johor',
  'Pahang',
  'Terengganu',
  'Kelantan',
  'Sarawak',
  'Sabah',
  'Wilayah Persekutuan Labuan',
];

const BASE = 'https://publicinfobanjir.water.gov.my/waterleveldata/';
const UA = 'MonsoonDesk/0.2 (Malaysia flood dashboard; fetches each state page at most every 15 min)';

const text = (html) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const num = (s) => (s === '' || s == null || Number.isNaN(Number(s)) ? null : Number(s));

/** Rows of the "waterlevel-data" table on one state page. */
export function parseStatePage(html, state) {
  const body = html.split('id="waterlevel-data"')[1]?.split('</tbody>')[0];
  if (!body) return [];
  return [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
    .map(([, row]) => {
      const cells = [...row.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)];
      if (cells.length < 12) return null;
      const c = cells.map((m) => text(m[2]));
      return {
        id: c[1],
        name: c[2],
        district: c[3],
        basin: c[4],
        river: c[5] || null,
        state,
        updated: c[6], // "27/10/2026 11:45:00", Malaysia time
        level: num(c[7]),
        // JPS colours the level cell: normal / waspada / amaran / bahaya
        status: cells[7][1].match(/state-cell\s+([\w-]+)/)?.[1] ?? null,
        normal: num(c[8]),
        alert: num(c[9]),
        warning: num(c[10]),
        danger: num(c[11]),
      };
    })
    .filter((r) => r && r.id && r.level != null);
}

async function fetchState(state, timeoutMs) {
  const res = await fetch(BASE + encodeURIComponent(state), {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseStatePage(await res.text(), state);
}

/** Fetch every state in parallel; a slow or broken state is reported, not fatal. */
export async function fetchAllStations({ timeoutMs = 8000 } = {}) {
  const results = await Promise.allSettled(STATES.map((s) => fetchState(s, timeoutMs)));
  const states = {};
  const stations = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      states[STATES[i]] = r.value.length;
      stations.push(...r.value);
    } else {
      states[STATES[i]] = `error: ${r.reason?.name === 'TimeoutError' ? 'timeout' : r.reason?.message}`;
    }
  });
  return { source: 'JPS Public Infobanjir', url: 'https://publicinfobanjir.water.gov.my', fetchedAt: new Date().toISOString(), states, stations };
}
