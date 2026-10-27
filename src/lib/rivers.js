// JPS river-level stations, from two sources turned into one shape:
// - live: our /api/rivers proxy over JPS Public Infobanjir (enrichJpsStations)
// - fallback: data.gov.my /flood-warning/, frozen at 23 Feb 2024 when this
//   was written (enrichStations)
// Every reading carries its age, and only fresh ones count in the score.

export const FRESH_HOURS = 6;

// JPS state names -> geojson state names
const STATE = {
  PERLIS: 'Perlis',
  KEDAH: 'Kedah',
  'PULAU PINANG': 'Penang',
  PERAK: 'Perak',
  KELANTAN: 'Kelantan',
  TERENGGANU: 'Terengganu',
  PAHANG: 'Pahang',
  SELANGOR: 'Selangor',
  'WILAYAH PERSEKUTUAN KUALA LUMPUR': 'Kuala Lumpur',
  'WILAYAH PERSEKUTUAN PUTRAJAYA': 'Putrajaya',
  'NEGERI SEMBILAN': 'Negeri Sembilan',
  MELAKA: 'Malacca',
  JOHOR: 'Johor',
  SARAWAK: 'Sarawak',
  SABAH: 'Sabah',
  'WILAYAH PERSEKUTUAN LABUAN': 'Labuan',
};

// Water-level status, mapped onto the shared status palette.
export const RIVER_LEVELS = {
  NORMAL: { key: 'normal', label: 'Normal', status: 'good', icon: '✓', rank: 0 },
  ALERT: { key: 'alert', label: 'Alert', status: 'warning', icon: '!', rank: 1 },
  WARNING: { key: 'warning', label: 'Warning', status: 'serious', icon: '!!', rank: 2 },
  DANGER: { key: 'danger', label: 'Danger', status: 'critical', icon: '▲', rank: 3 },
};

// API times are Malaysia local time without an offset: "2024-02-23 14:45:00"
const myt = (s) => (s ? new Date(`${s.replace(' ', 'T')}+08:00`) : null);

export function enrichStations(rows, now = Date.now()) {
  return rows
    .filter((r) => r.latitude != null && r.longitude != null && r.water_level_status !== 'OFF' && r.water_level_current != null)
    .map((r) => {
      const updated = myt(r.water_level_update_datetime);
      const ageH = updated ? (now - updated) / 36e5 : Infinity;
      const level = RIVER_LEVELS[r.water_level_indicator] ?? null;
      const { water_level_normal_level: normal, water_level_danger_level: danger } = r;
      return {
        id: r.station_id,
        name: r.station_name,
        river: r.sub_basin,
        basin: r.main_basin,
        district: r.district,
        state: STATE[r.state] ?? r.state,
        point: [r.latitude, r.longitude],
        current: r.water_level_current,
        normal,
        alert: r.water_level_alert_level,
        warning: r.water_level_warning_level,
        danger,
        trend: r.water_level_trend,
        rain1h: r.rainfall_latest_1hr,
        rainToday: r.rainfall_total_today,
        level,
        updated,
        ageH,
        fresh: ageH <= FRESH_HOURS,
        source: 'data.gov.my',
        // How far the river is from normal (0) to danger (1)
        toDanger: danger != null && normal != null && danger > normal ? (r.water_level_current - normal) / (danger - normal) : null,
      };
    })
    .filter((s) => s.level);
}

/** Newest reading across all stations, and how old it is. */
export function feedFreshness(stations, now = Date.now()) {
  const latest = stations.reduce((a, s) => (s.updated && (!a || s.updated > a) ? s.updated : a), null);
  const ageH = latest ? (now - latest) / 36e5 : Infinity;
  return { latest, ageH, fresh: ageH <= FRESH_HOURS };
}

export function fmtAge(hours) {
  if (!Number.isFinite(hours)) return 'unknown';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${Math.round(hours)} h`;
  const days = Math.round(hours / 24);
  return days < 730 ? `${days} days` : `${(days / 365).toFixed(1)} years`;
}

// JPS colours each level cell; the Malay class names map onto our levels.
const JPS_STATUS = { normal: 'NORMAL', waspada: 'ALERT', amaran: 'WARNING', bahaya: 'DANGER' };

// JPS district names that differ from the forecast's district names.
const DISTRICT_ALIASES = { 'CAMERON HIGHLANDS': 'Tanah Tinggi Cameron' };

const key = (s) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function statusFromThresholds(r) {
  if (r.danger != null && r.level >= r.danger) return 'DANGER';
  if (r.warning != null && r.level >= r.warning) return 'WARNING';
  if (r.alert != null && r.level >= r.alert) return 'ALERT';
  return 'NORMAL';
}

// "27/10/2026 11:45:00" in Malaysia time
function jpsTime(s) {
  const m = /(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/.exec(s ?? '');
  return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00+08:00`) : null;
}

/**
 * Stations from the /api/rivers proxy. JPS pages have no coordinates, so a
 * station takes them from the data.gov.my list when the name matches, else it
 * sits near its district's forecast point (marked approximate).
 */
export function enrichJpsStations(payload, refRows = [], zonePoint = () => null, now = Date.now()) {
  const ref = new Map(refRows.map((r) => [`${key(r.station_name)}|${STATE[r.state] ?? r.state}`, r]));
  const perDistrict = new Map();
  return payload.stations
    .map((r) => {
      const state = STATE[r.state.toUpperCase()] ?? r.state;
      const district = DISTRICT_ALIASES[r.district.toUpperCase()] ?? r.district;
      const match = ref.get(`${key(r.name)}|${state}`);
      let point = match ? [match.latitude, match.longitude] : null;
      if (!point) {
        const base = zonePoint(district, state);
        if (base) {
          // Spread stations of one district on a small spiral so they don't stack.
          const n = perDistrict.get(district) ?? 0;
          perDistrict.set(district, n + 1);
          const a = n * 2.4;
          const d = 0.025 * Math.sqrt(n);
          point = [base[0] + d * Math.sin(a), base[1] + d * Math.cos(a)];
        }
      }
      const updated = jpsTime(r.updated);
      const ageH = updated ? (now - updated) / 36e5 : Infinity;
      return {
        id: r.id,
        name: r.name,
        river: r.river,
        basin: r.basin,
        district,
        state,
        point,
        approx: !match,
        current: r.level,
        normal: r.normal,
        alert: r.alert,
        warning: r.warning,
        danger: r.danger,
        trend: null,
        level: RIVER_LEVELS[JPS_STATUS[r.status] ?? statusFromThresholds(r)],
        updated,
        ageH,
        fresh: ageH <= FRESH_HOURS,
        source: 'JPS Public Infobanjir',
        toDanger: r.danger != null && r.normal != null && r.danger > r.normal ? (r.level - r.normal) / (r.danger - r.normal) : null,
      };
    })
    .filter((s) => s.point);
}
