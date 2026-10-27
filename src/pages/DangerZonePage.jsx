import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, GeoJSON, Tooltip as MapTip } from 'react-leaflet';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import BaseMap from '../components/BaseMap.jsx';
import { Card, ChartTooltip, Key, Loading, Segmented, StatTile, StatusChip } from '../components/ui.jsx';
import { DECAY, LEVEL_WEIGHT, MONSOON, RISK_LEVELS, RIVER_FADE, RIVER_POINTS, WARNING_POINTS, drivers } from '../lib/floodRisk.js';
import { FRESH_HOURS, RIVER_LEVELS, feedFreshness, fmtAge } from '../lib/rivers.js';
import { loadStates } from '../lib/geo.js';
import { fmtDate, fmtDateTimeYear, fmtDay, todayMYT } from '../lib/format.js';
import { useTheme } from '../lib/theme.jsx';

const BORNEO = ['Sabah', 'Sarawak', 'Labuan'];
const REGIONS = [
  { value: 'all', label: 'All Malaysia' },
  { value: 'west', label: 'Peninsula' },
  { value: 'east', label: 'Sabah & Sarawak' },
];
const MIN_LEVELS = [
  { value: 0, label: 'All zones' },
  { value: 25, label: 'Moderate+' },
  { value: 50, label: 'High+' },
];
const ALERT = RISK_LEVELS.slice(1); // moderate, high, severe
const MAP_LAYERS = [
  { value: 'zones', label: 'Risk zones' },
  { value: 'rivers', label: 'River stations' },
  { value: 'both', label: 'Both' },
];
const inRegion = (region, state) => region === 'all' || (region === 'east') === BORNEO.includes(state);

const dayLabel = (d) => (d === todayMYT() ? 'Today' : fmtDay(d));

export default function DangerZonePage({ state, risk, stations, riversState }) {
  const { theme } = useTheme();
  const [statesGeo, setStatesGeo] = useState(null);
  const [day, setDay] = useState('peak');
  const [region, setRegion] = useState('all');
  const [minScore, setMinScore] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [mapLayer, setMapLayer] = useState('zones');

  useEffect(() => {
    loadStates().then(setStatesGeo);
  }, []);

  const zones = useMemo(
    () =>
      risk?.zones.filter((z) => inRegion(region, z.state)) ?? [],
    [risk, region],
  );
  const regionStations = useMemo(() => stations?.filter((s) => inRegion(region, s.state)) ?? [], [stations, region]);
  const at = (z) => (day === 'peak' ? z.peak : z.days.find((d) => d.date === day));
  const ranked = [...zones].sort((a, b) => at(b).score - at(a).score || a.name.localeCompare(b.name));

  useEffect(() => {
    if (ranked.length && !ranked.some((z) => z.id === selectedId)) setSelectedId(ranked[0].id);
  });

  if (!risk) return state.error ? null : <Loading />;

  const selected = zones.find((z) => z.id === selectedId) ?? ranked[0];
  const count = (key) => zones.filter((z) => at(z).level.key === key).length;
  const top = ranked[0];
  const listed = ranked.filter((z) => at(z).score >= minScore);
  const warned = zones.filter((z) => at(z).warnPts > 0).length;

  // Day with the most zones at moderate or worse
  const perDay = risk.dates.map((date) => {
    const row = { date };
    for (const l of RISK_LEVELS) row[l.key] = 0;
    for (const z of zones) row[z.days.find((d) => d.date === date).level.key] += 1;
    row.alert = row.moderate + row.high + row.severe;
    return row;
  });
  const worstDay = perDay.reduce((a, r) => (r.alert > a.alert ? r : a), perDay[0]);

  // States ranked by their worst zone
  const byState = new Map();
  for (const z of zones) {
    const d = at(z);
    const cur = byState.get(z.state);
    if (!cur || d.score > cur.score) byState.set(z.state, { state: z.state, score: d.score, level: d.level, zone: z.name });
  }
  const stateRows = [...byState.values()].sort((a, b) => b.score - a.score);
  const hotStates = stateRows.filter((s) => s.score >= 25);

  const color = (level) => theme.status[level.status];
  const tick = { fill: theme.muted, fontSize: 12 };
  const when = day === 'peak' ? 'over the next 7 days' : `on ${dayLabel(day)} ${fmtDate(day)}`;

  return (
    <div className="page">
      <RiskHero top={top} at={at} hotStates={hotStates} counts={RISK_LEVELS.map((l) => ({ ...l, n: count(l.key) }))} total={zones.length} when={when} />

      <div className="toolbar">
        <div className="day-picker" role="radiogroup" aria-label="Risk day">
          <button role="radio" aria-checked={day === 'peak'} className={`day ${day === 'peak' ? 'is-on' : ''}`} onClick={() => setDay('peak')}>
            <span className="day-name">Peak</span>
            <span className="day-date">7-day worst</span>
            <span className="day-meter risk-meter">
              <span style={{ width: `${zones.length ? (zones.filter((z) => z.peak.score >= 25).length / zones.length) * 100 : 0}%` }} />
            </span>
          </button>
          {perDay.map((r) => (
            <button key={r.date} role="radio" aria-checked={day === r.date} className={`day ${day === r.date ? 'is-on' : ''}`} onClick={() => setDay(r.date)}>
              <span className="day-name">{dayLabel(r.date)}</span>
              <span className="day-date">{fmtDate(r.date)}</span>
              <span className="day-meter risk-meter" aria-label={`${r.alert} zones moderate or worse`}>
                <span style={{ width: `${zones.length ? (r.alert / zones.length) * 100 : 0}%` }} />
              </span>
            </button>
          ))}
        </div>
        <Segmented label="Region" value={region} onChange={setRegion} options={REGIONS} />
      </div>

      <div className="stats">
        <StatTile
          label="High or severe"
          value={count('high') + count('severe')}
          unit={`/ ${zones.length}`}
          sub={count('severe') ? `${count('severe')} severe ${when}` : `zones ${when}`}
          tone="alert"
        />
        <StatTile label="Moderate" value={count('moderate')} unit={`/ ${zones.length}`} sub={`zones ${when}`} tone="warn" />
        <StatTile label="Under official warning" value={warned} sub="zones named in a MET land warning" />
        <StatTile
          label="Worst day"
          value={worstDay.alert ? dayLabel(worstDay.date) : '—'}
          sub={worstDay.alert ? `${fmtDate(worstDay.date)} · ${worstDay.alert} zones moderate or worse` : 'No zone above low'}
        />
      </div>

      <div className="grid-map">
        <Card
          className="card-map"
          title={`Flood danger map · ${day === 'peak' ? '7-day peak' : `${dayLabel(day)} ${fmtDate(day)}`}`}
          subtitle={
            mapLayer === 'rivers'
              ? 'JPS river-level stations by last reported status. Hollow = old reading, not used in the score.'
              : 'Districts and divisions by flood-risk index. Bigger circle = higher score. States shaded by their worst zone.'
          }
          actions={<Segmented label="Map layer" value={mapLayer} onChange={setMapLayer} options={MAP_LAYERS} />}
          legend={
            mapLayer === 'rivers'
              ? Object.values(RIVER_LEVELS).map((l) => <Key key={l.key} color={theme.status[l.status]} label={`${l.icon} ${l.label}`} shape="dot" />)
              : RISK_LEVELS.map((l) => <Key key={l.key} color={color(l)} label={`${l.icon} ${l.label}`} shape="dot" />)
          }
        >
          <BaseMap>
            {statesGeo ? (
              <GeoJSON
                key={`dz-${theme.mode}-${day}-${region}`}
                data={statesGeo}
                style={(f) => {
                  const s = byState.get(f.properties.shapeName);
                  return s && s.score >= 25
                    ? { color: color(s.level), weight: 1.5, fillColor: color(s.level), fillOpacity: 0.16 }
                    : { color: theme.axis, weight: 1, fillColor: theme.land, fillOpacity: 0.25 };
                }}
                interactive={false}
              />
            ) : null}
            {(mapLayer === 'rivers' ? [] : [...zones])
              .filter((z) => z.point)
              .sort((a, b) => at(a).score - at(b).score || (a.id === selected?.id) - (b.id === selected?.id))
              .map((z) => {
                const d = at(z);
                const isSel = z.id === selected?.id;
                const alarm = d.score >= 50;
                return (
                  <CircleMarker
                    key={`${z.id}-${theme.mode}-${isSel}-${day}`}
                    center={z.point}
                    radius={4 + (d.score / 100) * 12}
                    pathOptions={{
                      color: isSel ? theme.ink : alarm ? color(d.level) : theme.surface,
                      weight: isSel ? 3 : 1.5,
                      fillColor: color(d.level),
                      fillOpacity: d.score < 25 ? 0.55 : 0.92,
                      className: alarm && !isSel ? 'risk-pulse' : undefined,
                    }}
                    eventHandlers={{ click: () => setSelectedId(z.id) }}
                  >
                    <MapTip className="map-tip" direction="top" offset={[0, -6]}>
                      <strong>{z.name}</strong>, {z.state}
                      <br />
                      {d.level.label} · {d.score}/100{day === 'peak' ? ` on ${dayLabel(d.date)}` : ''}
                      <br />
                      {drivers(d).join(' · ') || 'No rain forecast'}
                    </MapTip>
                  </CircleMarker>
                );
              })}
            {mapLayer !== 'zones' ? <RiverMarkers stations={regionStations} small={mapLayer === 'both'} /> : null}
          </BaseMap>
        </Card>

        <section className="card zone-list">
          <header className="card-head">
            <div>
              <h2>Danger zones</h2>
              <p>
                {listed.length} of {zones.length} · highest score first
              </p>
            </div>
            <div className="card-actions">
              <Segmented label="Minimum level" value={minScore} onChange={setMinScore} options={MIN_LEVELS} />
            </div>
          </header>
          <ol className="warn-scroll zone-scroll">
            {listed.slice(0, 60).map((z, i) => {
              const d = at(z);
              return (
                <li key={z.id}>
                  <button className={`zone lvl-${d.level.key} ${z.id === selected?.id ? 'is-sel' : ''}`} onClick={() => setSelectedId(z.id)}>
                    <span className="zone-rank">{i + 1}</span>
                    <span className="zone-body">
                      <span className="zone-name">
                        <strong>{z.name}</strong>
                        <small>{z.state}</small>
                      </span>
                      <Spark days={z.days} active={d.date} color={color} />
                      <span className="zone-drivers">{drivers(d).slice(0, 3).join(' · ') || 'No rain forecast'}</span>
                    </span>
                    <span className="zone-score" style={{ '--lvl': color(d.level) }}>
                      {d.score}
                      <small>{d.level.label}</small>
                    </span>
                  </button>
                </li>
              );
            })}
            {!listed.length ? <p className="empty">No zone reaches this level {when}.</p> : null}
          </ol>
        </section>
      </div>

      <div className="grid-2">
        <ZoneDetail zone={selected} day={day === 'peak' ? selected?.peak.date : day} onDay={setDay} />

        <Card
          title="Risk trajectory"
          subtitle="Zones at moderate, high and severe risk each day. Click a day to map it."
          legend={ALERT.map((l) => <Key key={l.key} color={color(l)} label={`${l.icon} ${l.label}`} />)}
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={perDay} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} onClick={(e) => e?.activeLabel && setDay(e.activeLabel)}>
              {day !== 'peak' ? <ReferenceArea x1={day} x2={day} fill={theme.ink} fillOpacity={0.07} /> : null}
              <CartesianGrid vertical={false} stroke={theme.grid} />
              <XAxis
                dataKey="date"
                tick={tick}
                tickFormatter={(d) => (d === day ? `● ${fmtDay(d)}` : fmtDay(d))}
                axisLine={{ stroke: theme.axis }}
                tickLine={false}
              />
              <YAxis tick={tick} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: theme.grid, fillOpacity: 0.5 }}
                content={
                  <ChartTooltip
                    labelFormatter={(d) => `${dayLabel(d)} ${fmtDate(d)}`}
                    rows={(p) => [...p].reverse().map((s) => ({ color: s.color, name: s.name, value: s.value }))}
                  />
                }
              />
              {ALERT.map((l, i) => (
                <Bar
                  key={l.key}
                  dataKey={l.key}
                  name={l.label}
                  stackId="r"
                  fill={color(l)}
                  stroke={theme.surface}
                  strokeWidth={2}
                  maxBarSize={44}
                  radius={i === ALERT.length - 1 ? [4, 4, 0, 0] : 0}
                  style={{ cursor: 'pointer' }}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Risk by state" subtitle={`Score of each state's worst zone ${when}.`}>
          <ResponsiveContainer width="100%" height={Math.max(220, stateRows.length * 24 + 30)}>
            <BarChart data={stateRows} layout="vertical" margin={{ top: 4, right: 36, left: 8, bottom: 0 }} barCategoryGap={4}>
              <CartesianGrid horizontal={false} stroke={theme.grid} />
              <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={tick} axisLine={{ stroke: theme.axis }} tickLine={false} />
              <YAxis type="category" dataKey="state" width={120} tick={tick} axisLine={false} tickLine={false} interval={0} />
              <Tooltip
                cursor={{ fill: theme.grid, fillOpacity: 0.5 }}
                content={
                  <ChartTooltip
                    rows={(p) => [
                      { color: color(p[0].payload.level), name: p[0].payload.level.label, value: `${p[0].payload.score}/100` },
                      { name: 'worst zone', value: p[0].payload.zone },
                    ]}
                  />
                }
              />
              <Bar dataKey="score" radius={[0, 4, 4, 0]} maxBarSize={16}>
                {stateRows.map((s) => (
                  <Cell key={s.state} fill={color(s.level)} />
                ))}
                <LabelList dataKey="score" position="right" fill={theme.ink2} fontSize={11} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Method />
      </div>

      <RiverCard stations={regionStations} all={stations} riversState={riversState} onShow={() => setMapLayer('rivers')} />
    </div>
  );
}

function RiskHero({ top, at, hotStates, counts, total, when }) {
  const { theme } = useTheme();
  const d = top ? at(top) : null;
  const level = d?.level ?? RISK_LEVELS[0];
  const peers = hotStates.filter((s) => s.level.key === level.key).map((s) => s.state);
  const others = hotStates.length - peers.length;
  const headline =
    !d || d.score < 25
      ? `No flood danger signals ${when}`
      : `${level.label} flood risk in ${peers.length > 3 ? `${peers.length} states` : peers.join(', ')}`;

  return (
    <section className={`risk-hero lvl-${level.key}`} style={{ '--lvl': theme.status[level.status] }}>
      <Gauge score={d?.score ?? 0} />
      <div className="risk-hero-main">
        <span className="eyebrow">Flood danger outlook · indicative index</span>
        <h2>{headline}</h2>
        {others > 0 ? <p className="risk-sub">Plus {others} more {others === 1 ? 'state' : 'states'} at moderate or worse.</p> : null}
        {d ? (
          <p>
            Highest: <strong>{top.name}</strong>, {top.state} at <strong>{d.score}/100</strong>
            {` on ${dayLabel(d.date)} ${fmtDate(d.date)}`}. {drivers(d).join(' · ')}
          </p>
        ) : null}
        <div className="risk-scale" role="img" aria-label={counts.map((c) => `${c.n} ${c.label}`).join(', ')}>
          {counts.map((c) =>
            c.n ? (
              <span key={c.key} style={{ flexGrow: c.n, background: theme.status[c.status] }} title={`${c.n} ${c.label}`} />
            ) : null,
          )}
        </div>
        <div className="risk-scale-keys">
          {counts.map((c) => (
            <span key={c.key}>
              <i style={{ background: theme.status[c.status] }} />
              <strong>{c.n}</strong> {c.label.toLowerCase()}
            </span>
          ))}
          <span className="muted">of {total} zones</span>
        </div>
      </div>
      <aside className="risk-note">
        <strong>Not an official warning.</strong> Score built from MET's 7-day forecast, warnings in force and fresh JPS river levels. For official flood alerts see{' '}
        <a href="https://publicinfobanjir.water.gov.my" target="_blank" rel="noreferrer">
          JPS Public Infobanjir
        </a>{' '}
        and{' '}
        <a href="https://www.met.gov.my" target="_blank" rel="noreferrer">
          MET Malaysia
        </a>
        .
      </aside>
    </section>
  );
}

// Half-circle gauge: four level bands with a 2px gap, a marker at the score.
function Gauge({ score }) {
  const { theme } = useTheme();
  const R = 74;
  const cx = 90;
  const cy = 90;
  const pt = (v) => {
    const a = Math.PI * (1 - v / 100);
    return [cx + R * Math.cos(a), cy - R * Math.sin(a)];
  };
  const arc = (from, to) => {
    const [x1, y1] = pt(from);
    const [x2, y2] = pt(to);
    return `M${x1},${y1} A${R},${R} 0 0 1 ${x2},${y2}`;
  };
  const [mx, my] = pt(score);
  const level = RISK_LEVELS.findLast((l) => score >= l.min);
  return (
    <svg className="gauge" viewBox="0 0 180 104" role="img" aria-label={`Highest score ${score} of 100, ${level.label}`}>
      {RISK_LEVELS.map((l, i) => (
        <path
          key={l.key}
          d={arc(l.min + (i ? 0.8 : 0), (RISK_LEVELS[i + 1]?.min ?? 100) - (i < 3 ? 0.8 : 0))}
          stroke={theme.status[l.status]}
          strokeOpacity={score >= l.min ? 1 : 0.25}
          strokeWidth={14}
          fill="none"
        />
      ))}
      <circle cx={mx} cy={my} r={9} fill={theme.ink} stroke={theme.surface} strokeWidth={3} />
      <text x={cx} y={cy - 12} textAnchor="middle" className="gauge-value" fill={theme.ink}>
        {score}
      </text>
      <text x={cx} y={cy + 8} textAnchor="middle" className="gauge-unit" fill={theme.muted}>
        / 100 · {level.label}
      </text>
    </svg>
  );
}

// Seven tiny bars: the zone's score each day, coloured by level.
function Spark({ days, active, color }) {
  return (
    <span className="spark" aria-hidden="true">
      {days.map((d) => (
        <span
          key={d.date}
          className={d.date === active ? 'is-on' : ''}
          style={{ height: `${Math.max(8, d.score)}%`, background: color(d.level) }}
        />
      ))}
    </span>
  );
}

function ZoneDetail({ zone, day, onDay }) {
  const { theme } = useTheme();
  if (!zone) return <Card title="Zone" subtitle="Select a zone on the map or in the list." />;
  const d = zone.days.find((x) => x.date === day) ?? zone.peak;
  const data = zone.days.map((x) => ({
    date: x.date,
    rain: +x.rainPts.toFixed(1),
    monsoon: +x.monsoonPts.toFixed(1),
    warning: +x.warnPts.toFixed(1),
    river: +x.riverPts.toFixed(1),
    score: x.score,
    x,
  }));
  const parts = [
    { key: 'rain', label: 'Rain build-up', color: theme.series1 },
    { key: 'monsoon', label: 'Monsoon boost', color: theme.temp },
    { key: 'warning', label: 'MET warning', color: theme.series3 },
    { key: 'river', label: 'River level', color: theme.series4 },
  ].filter((p) => p.key !== 'river' || data.some((x) => x.river > 0));
  const tick = { fill: theme.muted, fontSize: 12 };

  return (
    <Card
      className="zone-detail"
      title={
        <span className="zone-title">
          {zone.name}
          <small>
            {zone.type === 'Dv' ? 'Division' : 'District'} · {zone.state}
          </small>
        </span>
      }
      subtitle={`Score parts per day. Lines mark the moderate, high and severe thresholds. Peak ${zone.peak.score} on ${dayLabel(zone.peak.date)}.`}
      actions={<StatusChip severity={d.level.status} icon={d.level.icon} label={`${d.level.label} · ${d.score}`} />}
      legend={parts.map((p) => <Key key={p.key} color={p.color} label={p.label} />)}
    >
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 58, left: -12, bottom: 0 }} onClick={(e) => e?.activeLabel && onDay(e.activeLabel)}>
          <ReferenceArea x1={d.date} x2={d.date} fill={theme.ink} fillOpacity={0.07} />
          <CartesianGrid vertical={false} stroke={theme.grid} />
          <XAxis dataKey="date" tick={tick} tickFormatter={(x) => fmtDay(x)} axisLine={{ stroke: theme.axis }} tickLine={false} />
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={tick} axisLine={false} tickLine={false} />
          {ALERT.map((l) => (
            <ReferenceLine
              key={l.key}
              y={l.min}
              stroke={theme.status[l.status]}
              strokeDasharray="4 4"
              label={{ value: l.label, position: 'right', fill: theme.muted, fontSize: 10 }}
            />
          ))}
          <Tooltip
            cursor={{ fill: theme.grid, fillOpacity: 0.5 }}
            content={
              <ChartTooltip
                labelFormatter={(x, p) => `${dayLabel(x)} ${fmtDate(x)} · ${p[0]?.payload.score}/100`}
                rows={(p) => [
                  ...[...p].reverse().map((s) => ({ color: s.color, name: s.name, value: s.value })),
                  { name: p[0].payload.x.cond.english, value: p[0].payload.x.cond.icon },
                ]}
              />
            }
          />
          {parts.map((p, i) => (
            <Bar
              key={p.key}
              dataKey={p.key}
              name={p.label}
              stackId="s"
              fill={p.color}
              stroke={theme.surface}
              strokeWidth={2}
              maxBarSize={40}
              radius={i === parts.length - 1 ? [4, 4, 0, 0] : 0}
              style={{ cursor: 'pointer' }}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <div className="zone-why">
        <span className="zone-why-label">Why · {dayLabel(d.date)}</span>
        {drivers(d).length ? drivers(d).map((t) => <span className="tag" key={t}>{t}</span>) : <span className="tag">No rain forecast</span>}
      </div>
    </Card>
  );
}

function Method() {
  return (
    <Card className="method" title="How the index works" subtitle="Rule-based v2 model. Inputs come from the live MET and JPS APIs.">
      <ol className="method-steps">
        <li>
          <strong>Daily rain load.</strong> Each day's forecast becomes a load: isolated rain {LEVEL_WEIGHT[1]}, isolated storms {LEVEL_WEIGHT[3]}, rain{' '}
          {LEVEL_WEIGHT[2]}, general thunderstorms {LEVEL_WEIGHT[4]}, plus up to 1.2 when it lasts all day.
        </li>
        <li>
          <strong>Build-up.</strong> Ground stays wet, so {Math.round(DECAY * 100)}% of yesterday's build-up carries into today. Several wet days in a
          row push the score up even when no single day looks extreme.
        </li>
        <li>
          <strong>Monsoon season.</strong> From November to March, zones in {MONSOON.states.join(', ')} get a {Math.round((MONSOON.factor - 1) * 100)}%
          boost: the north-east monsoon brings the biggest floods there.
        </li>
        <li>
          <strong>Official warnings.</strong> A MET land warning naming the zone adds {WARNING_POINTS.warning} / {WARNING_POINTS.serious} /{' '}
          {WARNING_POINTS.critical} points (alert / severe / danger). Continuous-rain warnings count in full, thunderstorm alerts at half.
        </li>
        <li>
          <strong>River levels.</strong> A JPS station near the zone reading alert / warning / danger adds {RIVER_POINTS.alert} /{' '}
          {RIVER_POINTS.warning} / {RIVER_POINTS.danger} points today, fading {Math.round((1 - RIVER_FADE) * 100)}% a day. Only readings from the
          last {FRESH_HOURS} hours count.
        </li>
        <li>
          <strong>Levels.</strong> {RISK_LEVELS.map((l) => `${l.label} ${l.min}+`).join(' · ')}.
        </li>
      </ol>
      <p className="method-note">
        Limits: no terrain or drainage data, river readings count only while the JPS feed is live, and the API has no past days, so the first day
        assumes yesterday was like today. Next step: keep daily history, then train a model on past flood events.
      </p>
    </Card>
  );
}

function RiverMarkers({ stations, small }) {
  const { theme } = useTheme();
  // Draw normal stations first so raised rivers sit on top.
  const sorted = [...stations].sort((a, b) => a.level.rank - b.level.rank);
  return sorted.map((s) => {
    const c = theme.status[s.level.status];
    return (
      <CircleMarker
        key={`${s.id}-${theme.mode}-${small}`}
        center={s.point}
        radius={(small ? 3 : 4) + s.level.rank * 1.5}
        pathOptions={{
          color: s.fresh ? theme.surface : c,
          weight: s.fresh ? 1 : 1.5,
          fillColor: c,
          fillOpacity: s.fresh ? 0.95 : 0.12,
        }}
      >
        <MapTip className="map-tip" direction="top" offset={[0, -4]}>
          <strong>{s.name}</strong>
          <br />
          {s.river ? `${s.river} · ` : ''}
          {s.district}, {s.state}
          <br />
          {s.level.label} · {s.current} m (normal {s.normal ?? '—'}, danger {s.danger ?? '—'})
          {s.trend ? ` · ${s.trend.toLowerCase().replace('_', ' ')}` : ''}
          <br />
          {s.fresh ? 'Updated' : 'Old reading'} {fmtDateTimeYear(s.updated)} · {fmtAge(s.ageH)} ago
        </MapTip>
      </CircleMarker>
    );
  });
}

const TREND_ICON = { RISING: '↑', RECEDING: '↓', NO_CHANGE: '→' };

function RiverCard({ stations, all, riversState, onShow }) {
  const { theme } = useTheme();
  if (!all) {
    return (
      <Card title="River stations · JPS" subtitle="River levels from the data.gov.my flood-warning API.">
        {riversState?.error ? <p className="empty">Could not load river stations: {riversState.error}</p> : <Loading label="Loading river stations…" />}
      </Card>
    );
  }
  const feed = feedFreshness(all);
  const count = (key) => stations.filter((s) => s.level.key === key).length;
  const raised = [...stations]
    // Raised rivers, plus normal ones over halfway to danger. A "normal" station
    // already past danger has mismatched thresholds, so it is left out.
    .filter((s) => s.level.rank >= 1 || (s.toDanger >= 0.5 && s.toDanger < 1))
    .sort((a, b) => b.level.rank - a.level.rank || (b.toDanger ?? 0) - (a.toDanger ?? 0))
    .slice(0, 12);

  return (
    <Card
      className="river-card"
      title="River stations · JPS"
      subtitle={`${stations.length} water-level stations with a reading. Status as last reported by each station.`}
      actions={
        <>
          <span className={`feed-chip ${feed.fresh ? 'is-live' : 'is-stale'}`}>
            <span className="feed-dot" aria-hidden="true" />
            {feed.fresh ? `Live · updated ${fmtAge(feed.ageH)} ago` : `Feed paused · last update ${fmtAge(feed.ageH)} ago`}
          </span>
          <button className="link-btn" onClick={onShow}>
            Show on map
          </button>
        </>
      }
    >
      {!feed.fresh ? (
        <div className="river-stale" role="status">
          <strong>The JPS feed on data.gov.my has not updated since {fmtDateTimeYear(feed.latest)}.</strong> These readings are shown for reference only
          and are not used in the flood score. When the feed starts again, readings from the last {FRESH_HOURS} hours will raise the score of the
          nearest zone automatically.
        </div>
      ) : null}

      <div className="river-counts">
        {Object.values(RIVER_LEVELS).map((l) => (
          <div key={l.key} className="river-count">
            <StatusChip severity={l.status} icon={l.icon} label={l.label} />
            <strong>{count(l.key)}</strong>
          </div>
        ))}
        <div className="river-count">
          <span className="muted">Fresh (under {FRESH_HOURS} h)</span>
          <strong>{stations.filter((s) => s.fresh).length}</strong>
        </div>
      </div>

      {raised.length ? (
        <div className="matrix-scroll">
          <table className="river-table">
            <thead>
              <tr>
                <th>Station</th>
                <th>State</th>
                <th>Level vs danger</th>
                <th>Status</th>
                <th>Last reading</th>
              </tr>
            </thead>
            <tbody>
              {raised.map((s) => (
                <tr key={s.id} className={s.fresh ? '' : 'is-stale'}>
                  <td>
                    <strong>{s.name}</strong>
                    <small>{s.basin ?? s.river}</small>
                  </td>
                  <td>{s.state}</td>
                  <td>
                    <span className="river-gauge" title={`${s.current} m · normal ${s.normal} m · danger ${s.danger} m`}>
                      <span style={{ width: `${Math.min(100, Math.max(2, (s.toDanger ?? 0) * 100))}%`, background: theme.status[s.level.status] }} />
                    </span>
                    <small>
                      {s.current} m / {s.danger ?? '—'} m {s.trend ? TREND_ICON[s.trend] ?? '' : ''}
                    </small>
                  </td>
                  <td>
                    <StatusChip severity={s.level.status} icon={s.level.icon} label={s.level.label} />
                  </td>
                  <td>
                    {fmtDateTimeYear(s.updated)}
                    <small>{fmtAge(s.ageH)} ago</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">No station is above normal in this region.</p>
      )}
    </Card>
  );
}
