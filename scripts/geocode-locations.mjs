// One-off build helper: the MET Malaysia forecast API returns location names
// without coordinates, so we geocode every location once with OpenStreetMap
// Nominatim and commit the result to src/data/locations.json.
//
// Usage: node scripts/geocode-locations.mjs
// Re-run only when MET adds new locations. Nominatim allows 1 request/second.

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const OUT = new URL('../src/data/locations.json', import.meta.url);
const STATES = new URL('../public/data/malaysia_states.geojson', import.meta.url);
const UA = 'WeatherFlood-detection/0.1 (student mini project)';

// IDs below 500 are Peninsular Malaysia, 500+ are Sabah, Sarawak and Labuan,
// except towns: Tn187-Tn201 are in Borneo. A miss retries without a box.
const VIEWBOX = {
  west: '99.5,6.9,104.7,1.2',
  east: '109.4,7.5,119.5,0.8',
};

// Names Nominatim can't resolve on its own.
const OVERRIDES = {
  Dv514: [5.33, 116.16], // Pedalaman = Interior Division (Keningau area)
  Dv515: [5.98, 116.07], // Pantai Barat = West Coast Division
  Rc013: [4.38, 102.40], // Taman Negara (Kuala Tahan)
  Rc018: [3.51, 102.20], // Kuala Gandah Elephant Conservation Centre
  Rc019: [3.08, 102.62], // Tasik Bera (lake)
  Rc017: [3.35, 101.83], // Bukit Tinggi, Bentong (Pahang)
  Ds011: [5.33, 100.21], // Barat Daya = South West Penang
  Ds012: [5.41, 100.31], // Timur Laut = North East Penang
  Tn145: [4.49, 101.38], // Tanah Rata - Brinchang
  Tn167: [5.36, 100.30], // Sungai Dua - Sungai Nibong
  Tn155: [3.24, 101.68], // Gombak (Taman Perwira)
  Tn152: [3.75, 102.55], // Bandar Tun Abdul Razak, Jengka
  Tn156: [4.23, 100.66], // Bandar Baru Seri Manjung
  Tn023: [5.21, 100.61], // Serdang, Kedah (not Serdang, Selangor = Tn164)
  Rc024: [2.79, 104.17], // Pulau Tioman (island lies outside the state outline)
  // District seats where Nominatim returns a point far from the district's town
  Ds047: [5.07, 103.01], // Hulu Terengganu (Kuala Berang)
  Ds048: [5.33, 103.14], // Kuala Terengganu
  Ds056: [4.76, 103.41], // Dungun
  Ds067: [2.94, 102.07], // Jelebu (Kuala Klawang)
  Ds070: [2.52, 101.8], // Port Dickson
  Ds072: [2.74, 102.25], // Kuala Pilah
  Ds077: [2.47, 102.23], // Tampin
  Ds083: [2.04, 102.57], // Muar
  Ds084: [1.85, 102.93], // Batu Pahat
  Ds087: [1.49, 103.39], // Pontian
  Ds089: [1.73, 103.9], // Kota Tinggi
  Tn184: [5.80, 102.57], // Kampung Raja, Besut
};

// Known state of every Peninsular district / recreation area (and Labuan).
// Searching "<name>, <state>" and checking the hit lies inside that state stops
// matches on same-named streets elsewhere ("Jalan Klang" in Penang, etc.).
// Borneo IDs need no list: the Borneo viewbox already pins them down.
const EXPECTED_STATE = Object.fromEntries(
  Object.entries({
    Perlis: 'Ds002',
    Kedah: 'Ds001 Ds003 Ds004 Ds005 Ds006 Ds007 Ds008 Ds009 Ds010 Ds015 Ds016 Ds018 Rc001',
    Penang: 'Ds011 Ds012 Ds013 Ds014 Ds017 Rc002 Rc003 Rc004',
    Perak: 'Ds019 Ds020 Ds021 Ds026 Ds029 Ds032 Ds033 Ds035 Ds036 Ds040 Ds041 Ds045 Ds092 Rc005 Rc006',
    Kelantan: 'Ds022 Ds023 Ds024 Ds025 Ds027 Ds028 Ds030 Ds031 Ds034 Ds039 Rc010',
    Terengganu: 'Ds037 Ds042 Ds046 Ds047 Ds048 Ds052 Ds056 Ds065 Rc007 Rc009 Rc011 Rc012 Rc015 Rc020 Rc022',
    Pahang:
      'Ds038 Ds044 Ds050 Ds053 Ds059 Ds061 Ds066 Ds069 Ds071 Ds076 Ds080 Rc008 Rc013 Rc014 Rc016 Rc017 Rc018 Rc019 Rc023 Rc024',
    Selangor: 'Ds043 Ds049 Ds051 Ds054 Ds055 Ds057 Ds060 Ds063 Ds064 Rc021',
    'Kuala Lumpur': 'Ds058',
    Putrajaya: 'Ds062',
    'Negeri Sembilan': 'Ds067 Ds068 Ds070 Ds072 Ds073 Ds074 Ds077',
    Malacca: 'Ds075 Ds078 Ds079',
    Johor: 'Ds081 Ds082 Ds083 Ds084 Ds085 Ds086 Ds087 Ds088 Ds089 Ds090 Rc025 Rc026',
    Labuan: 'Dv519',
    Sabah: 'Rc511',
  }).flatMap(([state, ids]) => ids.split(' ').map((id) => [id, state])),
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Federal territories sit inside Selangor's outline, so test them first.
const ENCLAVES = ['Kuala Lumpur', 'Putrajaya', 'Labuan'];

function stateOf(lon, lat, features) {
  const ordered = [...features].sort(
    (a, b) => ENCLAVES.includes(b.properties.shapeName) - ENCLAVES.includes(a.properties.shapeName),
  );
  const polysOf = (f) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates);
  for (const f of ordered) {
    if (polysOf(f).some((p) => pointInRing([lon, lat], p[0]))) return f.properties.shapeName;
  }
  // Islands and coastal points can land just offshore: use the nearest boundary vertex.
  let best = null;
  let bestD = Infinity;
  for (const f of features) {
    for (const p of polysOf(f)) {
      for (const [x, y] of p[0]) {
        const d = (x - lon) ** 2 + (y - lat) ** 2;
        if (d < bestD) [bestD, best] = [d, f.properties.shapeName];
      }
    }
  }
  return best;
}

// featureType=settlement keeps "Kuching" from matching "Jalan Kuching" in KL.
async function search(q, viewbox, featureType) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  const params = { q, format: 'jsonv2', countrycodes: 'my', limit: '1' };
  if (featureType) params.featureType = featureType;
  if (viewbox) Object.assign(params, { viewbox, bounded: '1' });
  url.search = new URLSearchParams(params);
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  await sleep(1100);
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const [hit] = await res.json();
  return hit ? [Number(hit.lat), Number(hit.lon)] : null;
}

function queriesFor(id, name) {
  const type = id.slice(0, 2);
  if (type === 'Ds') return [`${name} district`, name];
  if (type === 'Dv') return [`${name} division`, name];
  return [name];
}

const forecast = await (await fetch('https://api.data.gov.my/weather/forecast/')).json();
const locations = new Map(forecast.map((r) => [r.location.location_id, r.location.location_name]));
const states = JSON.parse(await readFile(STATES, 'utf8')).features;
const out = existsSync(OUT) ? JSON.parse(await readFile(OUT, 'utf8')) : {};

for (const [id, name] of [...locations].sort()) {
  if (out[id] || id.startsWith('St')) continue;
  let coords = OVERRIDES[id] ?? null;
  const num = Number(id.slice(2));
  const borneo = num >= 500 || (id.startsWith('Tn') && num >= 187);
  const viewbox = borneo ? VIEWBOX.east : VIEWBOX.west;
  const featureType = id.startsWith('Tn') ? 'settlement' : undefined;
  const expected = EXPECTED_STATE[id];
  const ok = (c) => c && (!expected || stateOf(c[1], c[0], states) === expected);
  const queries = expected ? queriesFor(id, name).map((q) => `${q}, ${expected}`).concat(queriesFor(id, name)) : queriesFor(id, name);
  for (const q of coords ? [] : queries) {
    const hit = (featureType && (await search(q, viewbox, featureType))) || (await search(q, viewbox));
    if (ok(hit)) {
      coords = hit;
      break;
    }
  }
  if (!coords && !expected) coords = await search(name, null);
  if (!coords) {
    console.warn(`  miss ${id} ${name}`);
    continue;
  }
  const [lat, lon] = coords;
  out[id] = { name, lat: +lat.toFixed(4), lon: +lon.toFixed(4), state: expected ?? stateOf(lon, lat, states) };
  console.log(`${id} ${name} -> ${out[id].lat}, ${out[id].lon} (${out[id].state})`);
  await writeFile(OUT, JSON.stringify(out, null, 1));
}

// Re-derive states for every entry so boundary-rule fixes apply to old results too.
for (const [id, loc] of Object.entries(out)) loc.state = EXPECTED_STATE[id] ?? stateOf(loc.lon, loc.lat, states);
await writeFile(OUT, JSON.stringify(out, null, 1));

console.log(`done: ${Object.keys(out).length} located of ${locations.size - 16} non-state locations`);
