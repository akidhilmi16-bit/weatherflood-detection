// JPS river-level and rain-gauge stations from data.gov.my /flood-warning/.
// The feed can stop updating (it was frozen at 23 Feb 2024 when this was
// written), so every reading carries its age and only fresh ones count.

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
