import LOCATIONS from '../data/locations.json';

// API state names -> state names in public/data/malaysia_states.geojson
export const STATE_SHAPE = {
  Perlis: 'Perlis',
  Kedah: 'Kedah',
  'Pulau Pinang': 'Penang',
  Perak: 'Perak',
  Kelantan: 'Kelantan',
  Terengganu: 'Terengganu',
  Pahang: 'Pahang',
  Selangor: 'Selangor',
  'WP Kuala Lumpur': 'Kuala Lumpur',
  'WP Putrajaya': 'Putrajaya',
  'Negeri Sembilan': 'Negeri Sembilan',
  Melaka: 'Malacca',
  Johor: 'Johor',
  Sarawak: 'Sarawak',
  Sabah: 'Sabah',
  'WP Labuan': 'Labuan',
};

// Ways a state is written in warning text -> geojson shape name
export const STATE_ALIASES = [
  ['Negeri Sembilan', 'Negeri Sembilan'],
  ['Kuala Lumpur', 'Kuala Lumpur'],
  ['Pulau Pinang', 'Penang'],
  ['Penang', 'Penang'],
  ['Putrajaya', 'Putrajaya'],
  ['Labuan', 'Labuan'],
  ['Melaka', 'Malacca'],
  ['Malacca', 'Malacca'],
  ['Perlis', 'Perlis'],
  ['Kedah', 'Kedah'],
  ['Perak', 'Perak'],
  ['Kelantan', 'Kelantan'],
  ['Terengganu', 'Terengganu'],
  ['Pahang', 'Pahang'],
  ['Selangor', 'Selangor'],
  ['Johor', 'Johor'],
  ['Sarawak', 'Sarawak'],
  ['Sabah', 'Sabah'],
];

/** Coordinates for a forecast location id (states use their polygon instead). */
export function locationPoint(id) {
  const loc = LOCATIONS[id];
  return loc ? [loc.lat, loc.lon] : null;
}

export function locationState(id, name) {
  if (id.startsWith('St')) return STATE_SHAPE[name] ?? name;
  return LOCATIONS[id]?.state ?? null;
}

export const ALL_LOCATIONS = LOCATIONS;

let statesPromise;
export function loadStates() {
  statesPromise ??= fetch('/data/malaysia_states.geojson').then((r) => r.json());
  return statesPromise;
}

export const MALAYSIA_BOUNDS = [
  [0.85, 99.6],
  [7.4, 119.3],
];
