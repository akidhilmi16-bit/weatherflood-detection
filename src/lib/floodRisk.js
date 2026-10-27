// Flood-risk index (v2, rule-based). Not an official warning: it turns MET's
// 7-day forecast and the warnings in force into a 0-100 score per district /
// division so the places where rain keeps piling up stand out.
//
//   score = rain build-up x monsoon factor + official warning points
//
// Rain build-up: each day's rain load (intensity + how long it lasts) is added
// to what is left of the previous days (DECAY), because floods follow rain
// that falls day after day on wet ground, not one afternoon storm.

import { parseCondition } from './conditions.js';
import { locationPoint, locationState } from './geo.js';
import { mytDate } from './warnings.js';

export const RISK_LEVELS = [
  { key: 'low', label: 'Low', status: 'good', icon: '✓', min: 0 },
  { key: 'moderate', label: 'Moderate', status: 'warning', icon: '!', min: 25 },
  { key: 'high', label: 'High', status: 'serious', icon: '!!', min: 50 },
  { key: 'severe', label: 'Severe', status: 'critical', icon: '▲', min: 75 },
];

export const riskLevel = (score) => RISK_LEVELS.findLast((l) => score >= l.min);

// Weight per rain level (0 dry ... 4 general thunderstorms). Isolated storms are
// short convective bursts, so they weigh less than general rain.
export const LEVEL_WEIGHT = [0, 0.6, 2.4, 1.2, 2.8];
// Extra load when the rain covers more of the day.
const DURATION_BONUS = { 'sepanjang hari': 1.2, 'petang dan malam': 0.6, 'pagi dan petang': 0.6, 'pagi dan malam': 0.6 };
export const DECAY = 0.55;
export const RAIN_SCALE = 6;

// North-east monsoon (Nov-Mar) brings the big floods to the east coast and Borneo.
export const MONSOON = { months: [11, 12, 1, 2, 3], states: ['Kelantan', 'Terengganu', 'Pahang', 'Johor', 'Sabah', 'Sarawak'], factor: 1.2 };

export const WARNING_POINTS = { warning: 15, serious: 28, critical: 42 };
// Continuous rain is the flood warning; thunderstorm alerts last only hours.
const warningKind = (w) => {
  const t = `${w.warning_issue?.title_en ?? ''} ${w.heading_en ?? ''}`.toLowerCase();
  if (t.includes('continuous rain')) return { kind: 'Continuous rain', factor: 1 };
  if (t.includes('thunderstorm')) return { kind: 'Thunderstorm', factor: 0.5 };
  return { kind: 'Weather', factor: 0.5 };
};

function dailyLoad(row) {
  const cond = parseCondition(row.summary_forecast);
  if (cond.level <= 0) return { cond, load: 0 };
  const when = (row.summary_when ?? '').toLowerCase().trim();
  return { cond, load: LEVEL_WEIGHT[cond.level] + (DURATION_BONUS[when] ?? 0) };
}

// Does warning w cover any part of the MYT calendar day `date`?
function covers(w, date) {
  const dayStart = new Date(`${date}T00:00:00+08:00`);
  const dayEnd = new Date(dayStart.getTime() + 864e5);
  const from = mytDate(w.valid_from) ?? dayStart;
  const to = mytDate(w.valid_to) ?? dayEnd;
  return from < dayEnd && to > dayStart;
}

// A land warning names a state alone (whole state) or a state with districts.
function warningHits(w, zone) {
  if (!w.areas.states.includes(zone.state)) return false;
  const named = w.areas.places.filter((p) => p.state === zone.state);
  return !named.length || named.some((p) => p.id === zone.id);
}

export function buildRisk(rows, warnings = []) {
  const dates = [...new Set(rows.map((r) => r.date))].sort();
  const zones = new Map();
  // Many divisions share their name and seat with a district (Kuching, Labuan…):
  // keep the district so the map doesn't stack two circles on one town.
  const districtNames = new Set(rows.filter((r) => r.location.location_id.startsWith('Ds')).map((r) => r.location.location_name));
  for (const r of rows) {
    const { location_id: id, location_name: name } = r.location;
    const type = id.slice(0, 2);
    if (type !== 'Ds' && type !== 'Dv') continue;
    if (type === 'Dv' && districtNames.has(name)) continue;
    if (!zones.has(id)) zones.set(id, { id, name, type, state: locationState(id, name), point: locationPoint(id), rows: {} });
    zones.get(id).rows[r.date] = r;
  }

  const live = warnings.filter((w) => (w.status === 'active' || w.status === 'upcoming') && w.areas.states.length);

  for (const z of zones.values()) {
    // The API has no past days, so assume yesterday's rain matched today's.
    let acc = null;
    let streak = 0;
    z.days = dates.map((date) => {
      const row = z.rows[date];
      const { cond, load } = row ? dailyLoad(row) : { cond: parseCondition(''), load: 0 };
      acc = load + DECAY * (acc ?? load);
      streak = load >= LEVEL_WEIGHT[2] ? streak + 1 : 0;
      const month = Number(date.slice(5, 7));
      const monsoon = MONSOON.months.includes(month) && MONSOON.states.includes(z.state) ? MONSOON.factor : 1;
      const rainPts = acc * RAIN_SCALE;
      const monsoonPts = rainPts * (monsoon - 1);
      const hits = live.filter((w) => covers(w, date) && warningHits(w, z));
      const warnPts = Math.max(0, ...hits.map((w) => WARNING_POINTS[w.severity] * warningKind(w).factor));
      const score = Math.min(100, Math.round(rainPts + monsoonPts + warnPts));
      return {
        date,
        score,
        level: riskLevel(score),
        cond,
        load,
        rainPts,
        monsoonPts,
        warnPts,
        streak,
        warnings: hits.map((w) => ({ key: w.key, title: w.warning_issue.title_en, kind: warningKind(w).kind, severity: w.severity })),
        row,
      };
    });
    z.peak = z.days.reduce((a, d) => (d.score > a.score ? d : a), z.days[0]);
    delete z.rows;
  }
  return { dates, zones: [...zones.values()] };
}

/** Plain-language reasons behind a zone's score on one day. */
export function drivers(day) {
  const out = [];
  if (day.streak >= 2) out.push(`${day.streak} wet days in a row`);
  if (day.load > 0) out.push(day.cond.english);
  if (day.monsoonPts > 0.5) out.push('NE monsoon season');
  for (const w of day.warnings) out.push(`${w.kind} warning`);
  return out;
}
