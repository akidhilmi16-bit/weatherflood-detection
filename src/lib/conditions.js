// MET Malaysia forecast phrases are Malay-only free text from a fixed
// vocabulary. We reduce each phrase to an ordered rain-intensity level
// (0 = dry … 4 = widespread thunderstorms). This level is also the main
// input feature planned for the v2 flood-risk model.

export const LEVELS = [
  { level: 0, key: 'dry', label: 'No rain', short: 'Dry', icon: '☀' },
  { level: 1, key: 'rain-isolated', label: 'Isolated rain', short: 'Isolated rain', icon: '🌦' },
  { level: 2, key: 'rain', label: 'Rain', short: 'Rain', icon: '🌧' },
  { level: 3, key: 'storm-isolated', label: 'Isolated thunderstorms', short: 'Isolated storms', icon: '⛈' },
  { level: 4, key: 'storm', label: 'Thunderstorms', short: 'Storms', icon: '⛈' },
];

export const HAZE = { level: -1, key: 'haze', label: 'Hazy', short: 'Haze', icon: '🌫' };

const WHEN = {
  pagi: 'morning',
  petang: 'afternoon',
  malam: 'night',
  'pagi dan petang': 'morning & afternoon',
  'pagi dan malam': 'morning & night',
  'petang dan malam': 'afternoon & night',
  'sepanjang hari': 'all day',
  'tiada hujan': '—',
};

/** Translate a Malay forecast phrase into { level, label, english } */
export function parseCondition(phrase) {
  const p = (phrase ?? '').toLowerCase().trim();
  if (!p) return { ...LEVELS[0], english: '—' };
  if (p.includes('berjerebu')) return { ...HAZE, english: 'Hazy' };

  const storm = p.includes('ribut petir');
  const rain = storm || p.includes('hujan');
  if (!rain || p.startsWith('tiada')) return { ...LEVELS[0], english: 'No rain' };

  // "di satu dua tempat" (one or two places) and "di beberapa tempat" (several
  // places) are isolated; "di kebanyakan tempat" (most places), "menyeluruh"
  // (widespread) and the bare phrase are general.
  const isolated = p.includes('satu dua tempat') || p.includes('beberapa tempat');
  const base = LEVELS[storm ? (isolated ? 3 : 4) : isolated ? 1 : 2];

  let english = storm ? 'Thunderstorms' : 'Rain';
  if (p.includes('satu dua tempat')) english += ' in one or two places';
  else if (p.includes('beberapa tempat')) english += ' in several places';
  else if (p.includes('kebanyakan tempat')) english += ' in most places';
  else if (p.includes('menyeluruh')) english = storm ? 'Widespread thunderstorms' : 'Widespread rain';
  if (p.includes('kawasan pantai')) english += ' (coastal)';
  if (p.includes('kawasan pedalaman')) english += ' (inland)';

  return { ...base, english };
}

export function translateWhen(when) {
  return WHEN[(when ?? '').toLowerCase().trim()] ?? when ?? '';
}

export const LOCATION_TYPES = {
  St: 'State',
  Dv: 'Division',
  Ds: 'District',
  Tn: 'Town',
  Rc: 'Recreation',
};
