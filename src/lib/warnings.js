import { STATE_ALIASES, ALL_LOCATIONS } from './geo.js';

// MET warnings list affected areas only inside the English free text, e.g.
//   "...over the states of Perlis • Kedah (Langkawi, Kubang Pasu) • Sarawak: Miri,
//    Kapit (Belaga, Kapit and Song) until 7:00 PM ..."
// We pull out the states and the named districts/divisions so they can be mapped.

// English names MET uses that differ from the forecast location names.
const PLACE_ALIASES = {
  interior: 'pedalaman',
  'west coast': 'pantai barat',
  'cameron highlands': 'tanah tinggi cameron',
  'larut matang': 'larut, matang dan selama',
  'south west': 'barat daya',
  'north east': 'timur laut',
  'labuk and sugut': 'labuk & sugut',
};

const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();

// name+state -> location ids (districts, divisions and towns)
const PLACE_INDEX = new Map();
for (const [id, loc] of Object.entries(ALL_LOCATIONS)) {
  if (id.startsWith('Rc')) continue;
  const key = `${norm(loc.name)}|${loc.state}`;
  if (!PLACE_INDEX.has(key)) PLACE_INDEX.set(key, []);
  PLACE_INDEX.get(key).push(id);
}

function findPlace(name, state) {
  const n = PLACE_ALIASES[norm(name)] ?? norm(name);
  const ids = PLACE_INDEX.get(`${n}|${state}`);
  if (!ids) return null;
  // Prefer the district/division polygon-equivalent over a town of the same name.
  return ids.find((i) => i.startsWith('Ds')) ?? ids.find((i) => i.startsWith('Dv')) ?? ids[0];
}

export function parseAffectedAreas(text) {
  // Land warnings say "over the states of …". Marine warnings say "over the
  // waters of Selangor …", which names sea areas, not land, so they map nothing.
  const start = text?.search(/states of/i) ?? -1;
  if (start < 0) return { states: [], places: [] };
  const body = text.slice(start + 'states of'.length).split(/\s+until\s+/i)[0];
  const states = new Set();
  const places = [];

  for (const segment of body.split('•')) {
    const hit = STATE_ALIASES.find(([alias]) => new RegExp(`\\b${alias}\\b`, 'i').test(segment));
    if (!hit) continue;
    const [alias, state] = hit;
    states.add(state);

    const rest = segment.slice(segment.search(new RegExp(`\\b${alias}\\b`, 'i')) + alias.length);
    const names = rest
      .replace(/[():]/g, ',')
      .split(/,|\band\b/i)
      .map((s) => s.trim())
      .filter((s) => s.length > 1);
    for (const name of names) {
      const id = findPlace(name, state);
      if (id && !places.some((p) => p.id === id)) places.push({ id, name, state });
    }
  }
  return { states: [...states], places };
}

// MET grades: Thunderstorm / Continuous rain ALERT -> warning,
// BAD WEATHER / 2nd category -> serious, DANGER / 3rd category -> critical.
export function severityOf(w) {
  const t = `${w.heading_en ?? ''} ${w.warning_issue?.title_en ?? ''}`.toUpperCase();
  if (t.includes('NO ADVISORY')) return 'good';
  if (t.includes('DANGER') || t.includes('THIRD CATEGORY')) return 'critical';
  if (t.includes('BAD WEATHER') || t.includes('SEVERE') || t.includes('SECOND CATEGORY')) return 'serious';
  return 'warning';
}

export const SEVERITY = {
  good: { label: 'No advisory', icon: '✓', rank: 0 },
  warning: { label: 'Alert', icon: '!', rank: 1 },
  serious: { label: 'Severe', icon: '!!', rank: 2 },
  critical: { label: 'Danger', icon: '▲', rank: 3 },
};

// API timestamps are Malaysia local time without an offset.
export const mytDate = (s) => (s ? new Date(`${s}+08:00`) : null);

export function warningStatus(w, now = new Date()) {
  const from = mytDate(w.valid_from);
  const to = mytDate(w.valid_to);
  if (!from && !to) return 'info';
  if (from && from > now) return 'upcoming';
  if (to && to < now) return 'expired';
  return 'active';
}

export function enrichWarnings(rows, now = new Date()) {
  return rows.map((w, i) => ({
    ...w,
    key: `${w.warning_issue?.issued}-${i}`,
    severity: severityOf(w),
    status: warningStatus(w, now),
    areas: parseAffectedAreas(w.text_en),
  }));
}
