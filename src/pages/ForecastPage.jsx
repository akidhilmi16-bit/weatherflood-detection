import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, GeoJSON, Tooltip as MapTip } from 'react-leaflet';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import BaseMap from '../components/BaseMap.jsx';
import { Card, ChartTooltip, Key, Loading, Pager, Segmented, StatTile } from '../components/ui.jsx';
import { usePagination } from '../lib/usePagination.js';
import { HAZE, LEVELS, LOCATION_TYPES, parseCondition, translateWhen } from '../lib/conditions.js';
import { STATE_SHAPE, loadStates, locationPoint, locationState } from '../lib/geo.js';
import { fmtDate, fmtDay, todayMYT } from '../lib/format.js';
import { rainColor, useTheme } from '../lib/theme.jsx';

const LAYERS = ['St', 'Ds', 'Tn', 'Dv', 'Rc'];
const LAYER_LABEL = { St: 'States', Ds: 'Districts', Tn: 'Towns', Dv: 'Divisions', Rc: 'Recreation' };
const SHAPE_TO_STATE = Object.fromEntries(Object.entries(STATE_SHAPE).map(([api, shape]) => [shape, api]));

function buildModel(rows) {
  const dates = [...new Set(rows.map((r) => r.date))].sort();
  const locations = new Map();
  for (const r of rows) {
    const { location_id: id, location_name: name } = r.location;
    if (!locations.has(id)) {
      locations.set(id, {
        id,
        name,
        type: id.slice(0, 2),
        state: locationState(id, name),
        point: locationPoint(id),
        days: {},
      });
    }
    locations.get(id).days[r.date] = {
      ...r,
      cond: parseCondition(r.summary_forecast),
      morning: parseCondition(r.morning_forecast),
      afternoon: parseCondition(r.afternoon_forecast),
      night: parseCondition(r.night_forecast),
    };
  }
  return { dates, locations: [...locations.values()] };
}

export default function ForecastPage({ state }) {
  const { theme } = useTheme();
  const [statesGeo, setStatesGeo] = useState(null);
  const [layer, setLayer] = useState('St');
  const [day, setDay] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState('storm');

  useEffect(() => {
    loadStates().then(setStatesGeo);
  }, []);

  const model = useMemo(() => (state.data ? buildModel(state.data) : null), [state.data]);

  useEffect(() => {
    if (!model || day) return;
    const today = todayMYT();
    setDay(model.dates.find((d) => d >= today) ?? model.dates[0]);
  }, [model, day]);

  const inLayer = useMemo(() => model?.locations.filter((l) => l.type === layer) ?? [], [model, layer]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? inLayer.filter((l) => `${l.name} ${l.state ?? ''}`.toLowerCase().includes(q)) : inLayer;
    const stormDays = (l) => Object.values(l.days).filter((d) => d.cond.level >= 3).length;
    return [...list].sort((a, b) =>
      sortBy === 'name'
        ? a.name.localeCompare(b.name)
        : sortBy === 'temp'
          ? (b.days[day]?.max_temp ?? 0) - (a.days[day]?.max_temp ?? 0)
          : stormDays(b) - stormDays(a) || (b.days[day]?.cond.level ?? 0) - (a.days[day]?.cond.level ?? 0),
    );
  }, [inLayer, query, sortBy, day]);
  const pager = usePagination(visible, { pageSize: 20, resetKey: `${layer}-${query}-${sortBy}` });

  // Default selection: the stormiest location of the current layer on the chosen day.
  useEffect(() => {
    if (!day || !inLayer.length) return;
    if (selectedId && inLayer.some((l) => l.id === selectedId)) return;
    const top = [...inLayer].sort((a, b) => (b.days[day]?.cond.level ?? 0) - (a.days[day]?.cond.level ?? 0))[0];
    setSelectedId(top?.id ?? null);
  }, [inLayer, day, selectedId]);

  // A location picked on the map jumps the matrix to its page.
  const [jumpTo, setJumpTo] = useState(null);
  useEffect(() => {
    if (jumpTo) pager.reveal((l) => l.id === jumpTo.id);
  }, [jumpTo]);
  const pick = (id) => {
    setSelectedId(id);
    setJumpTo({ id });
  };

  if (!model || !day) return state.error ? null : <Loading />;

  const selected = model.locations.find((l) => l.id === selectedId);
  const dayRows = inLayer.map((l) => l.days[day]).filter(Boolean);

  // KPIs for the chosen day and layer
  const storms = dayRows.filter((r) => r.cond.level >= 3).length;
  const wet = dayRows.filter((r) => r.cond.level >= 1).length;
  const hottest = dayRows.reduce((a, r) => (r.max_temp > (a?.max_temp ?? -99) ? r : a), null);
  const coolest = dayRows.reduce((a, r) => (r.min_temp < (a?.min_temp ?? 99) ? r : a), null);
  const pct = (n) => (dayRows.length ? Math.round((n / dayRows.length) * 100) : 0);

  // 7-day outlook: how many locations fall in each rain level per day
  const outlook = model.dates.map((d) => {
    const row = { date: d };
    for (const lv of [...LEVELS, HAZE]) row[lv.key] = 0;
    for (const l of inLayer) {
      const c = l.days[d]?.cond;
      if (c) row[c.key] += 1;
    }
    return row;
  });
  const hasHaze = outlook.some((r) => r.haze > 0);
  const stackKeys = [...LEVELS].reverse().concat(hasHaze ? [HAZE] : []);

  // State temperature ranges for the chosen day
  const tempRows = model.locations
    .filter((l) => l.type === 'St' && l.days[day])
    .map((l) => ({ name: l.name.replace('WP ', ''), range: [l.days[day].min_temp, l.days[day].max_temp], ...l.days[day] }))
    .sort((a, b) => b.max_temp - a.max_temp);

  const tick = { fill: theme.muted, fontSize: 12 };
  const levelOf = (shapeName) => {
    const loc = model.locations.find((l) => l.type === 'St' && l.name === SHAPE_TO_STATE[shapeName]);
    return { loc, row: loc?.days[day] };
  };

  return (
    <div className="page">
      <div className="toolbar">
        <div className="day-picker" role="radiogroup" aria-label="Forecast day">
          {model.dates.map((d) => {
            const counts = inLayer.filter((l) => (l.days[d]?.cond.level ?? 0) >= 3).length;
            return (
              <button key={d} role="radio" aria-checked={d === day} className={`day ${d === day ? 'is-on' : ''}`} onClick={() => setDay(d)}>
                <span className="day-name">{d === todayMYT() ? 'Today' : fmtDay(d)}</span>
                <span className="day-date">{fmtDate(d)}</span>
                <span className="day-meter" aria-label={`${counts} stormy`}>
                  <span style={{ width: `${inLayer.length ? (counts / inLayer.length) * 100 : 0}%` }} />
                </span>
              </button>
            );
          })}
        </div>
        <Segmented
          label="Location type"
          value={layer}
          onChange={(v) => {
            setLayer(v);
            setSelectedId(null);
          }}
          options={LAYERS.map((t) => ({ value: t, label: LAYER_LABEL[t], count: model.locations.filter((l) => l.type === t).length }))}
        />
      </div>

      <div className="stats">
        <StatTile
          label="Thunderstorm risk"
          value={storms}
          unit={`/ ${dayRows.length}`}
          sub={`${LAYER_LABEL[layer].toLowerCase()} expecting storms · ${pct(storms)}%`}
          tone="storm"
        />
        <StatTile label="Wet coverage" value={pct(wet)} unit="%" sub={`${wet} ${LAYER_LABEL[layer].toLowerCase()} with rain or storms`} />
        <StatTile label="Hottest" value={hottest?.max_temp ?? '—'} unit="°C" sub={hottest?.location.location_name} tone="hot" />
        <StatTile label="Coolest" value={coolest?.min_temp ?? '—'} unit="°C" sub={coolest?.location.location_name} />
      </div>

      <div className="grid-map">
        <Card
          className="card-map"
          title={`Rain outlook · ${fmtDay(day)} ${fmtDate(day)}`}
          subtitle={`${LAYER_LABEL[layer]} coloured by forecast rain intensity. Click a ${layer === 'St' ? 'state' : 'point'} for details.`}
          legend={
            <>
              {LEVELS.map((lv) => (
                <Key key={lv.key} color={theme.rain[lv.level]} label={lv.label} shape={layer === 'St' ? 'rect' : 'dot'} />
              ))}
              {hasHaze ? <Key color={theme.haze} label={HAZE.label} shape={layer === 'St' ? 'rect' : 'dot'} /> : null}
            </>
          }
        >
          <BaseMap>
            {statesGeo ? (
              <GeoJSON
                key={`states-${layer}-${day}-${theme.mode}`}
                data={statesGeo}
                style={(f) => {
                  if (layer !== 'St') return { color: theme.axis, weight: 1, fillColor: theme.land, fillOpacity: 0.25 };
                  const { loc, row } = levelOf(f.properties.shapeName);
                  const isSel = loc?.id === selectedId;
                  return {
                    color: isSel ? theme.ink : theme.surface,
                    weight: isSel ? 2.5 : 1,
                    fillColor: row ? rainColor(theme, row.cond) : theme.land,
                    fillOpacity: 0.82,
                  };
                }}
                onEachFeature={(f, lyr) => {
                  if (layer !== 'St') return;
                  const { loc, row } = levelOf(f.properties.shapeName);
                  if (!loc || !row) return;
                  lyr.bindTooltip(
                    `<strong>${loc.name}</strong><br/>${row.cond.english}<br/>${row.min_temp}–${row.max_temp}°C`,
                    { sticky: true, className: 'map-tip' },
                  );
                  lyr.on('click', () => pick(loc.id));
                }}
              />
            ) : null}
            {layer !== 'St'
              ? inLayer
                  .filter((l) => l.point && l.days[day])
                  .sort((a, b) => (a.id === selectedId) - (b.id === selectedId))
                  .map((l) => {
                    const r = l.days[day];
                    const isSel = l.id === selectedId;
                    return (
                      <CircleMarker
                        key={`${l.id}-${theme.mode}-${isSel}`}
                        center={l.point}
                        radius={isSel ? 10 : 7}
                        pathOptions={{
                          color: isSel ? theme.ink : theme.surface,
                          weight: isSel ? 3 : 1.5,
                          fillColor: rainColor(theme, r.cond),
                          fillOpacity: 1,
                        }}
                        eventHandlers={{ click: () => pick(l.id) }}
                      >
                        <MapTip className="map-tip" direction="top" offset={[0, -6]}>
                          <strong>{l.name}</strong>
                          <br />
                          {r.cond.english}
                          <br />
                          {r.min_temp}–{r.max_temp}°C
                        </MapTip>
                      </CircleMarker>
                    );
                  })
              : null}
          </BaseMap>
        </Card>

        <LocationDetail loc={selected} day={day} dates={model.dates} onDay={setDay} />
      </div>

      <div className="grid-2">
        <Card
          title="7-day rain outlook"
          subtitle={`Number of ${LAYER_LABEL[layer].toLowerCase()} in each rain level. Click a day to map it.`}
          legend={stackKeys.map((lv) => (
            <Key key={lv.key} color={lv.level < 0 ? theme.haze : theme.rain[lv.level]} label={lv.short} />
          ))}
        >
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={outlook} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} onClick={(e) => e?.activeLabel && setDay(e.activeLabel)}>
              <ReferenceArea x1={day} x2={day} fill={theme.ink} fillOpacity={0.07} />
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
                    labelFormatter={(d) => `${fmtDay(d)} ${fmtDate(d)}`}
                    rows={(p) =>
                      [...p].reverse().map((s) => ({ color: s.color, name: s.name, value: s.value }))
                    }
                  />
                }
              />
              {stackKeys.map((lv, i) => (
                <Bar
                  key={lv.key}
                  dataKey={lv.key}
                  name={lv.label}
                  stackId="a"
                  fill={lv.level < 0 ? theme.haze : theme.rain[lv.level]}
                  stroke={theme.surface}
                  strokeWidth={2}
                  maxBarSize={44}
                  radius={i === stackKeys.length - 1 ? [4, 4, 0, 0] : 0}
                  style={{ cursor: 'pointer' }}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title={`Temperature range by state · ${fmtDay(day)}`} subtitle="Forecast minimum to maximum, °C. Sorted by daytime high.">
          <ResponsiveContainer width="100%" height={Math.max(280, tempRows.length * 22 + 30)}>
            <BarChart data={tempRows} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 0 }} barCategoryGap={4}>
              <CartesianGrid horizontal={false} stroke={theme.grid} />
              <XAxis
                type="number"
                domain={[(min) => Math.floor(min - 2), (max) => Math.ceil(max + 1)]}
                tick={tick}
                axisLine={{ stroke: theme.axis }}
                tickLine={false}
                unit="°"
              />
              <YAxis type="category" dataKey="name" tick={tick} width={110} axisLine={false} tickLine={false} interval={0} />
              <Tooltip
                cursor={{ fill: theme.grid, fillOpacity: 0.5 }}
                content={
                  <ChartTooltip
                    rows={(p) => [
                      { color: theme.temp, name: 'max', value: `${p[0].payload.max_temp}°C` },
                      { name: 'min', value: `${p[0].payload.min_temp}°C` },
                      { name: p[0].payload.cond.english, value: p[0].payload.cond.icon },
                    ]}
                  />
                }
              />
              <Bar dataKey="range" name="Temperature" fill={theme.temp} radius={4} maxBarSize={14}>
                <LabelList dataKey="max_temp" position="right" formatter={(v) => `${v}°`} fill={theme.ink2} fontSize={11} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card
        title={`${LAYER_LABEL[layer]} · 7-day matrix`}
        subtitle="Every location's daily outlook. Cell colour = rain intensity, number = daytime high."
        actions={
          <>
            <input className="search" type="search" placeholder={`Search ${LAYER_LABEL[layer].toLowerCase()}…`} value={query} onChange={(e) => setQuery(e.target.value)} />
            <Segmented
              label="Sort"
              value={sortBy}
              onChange={setSortBy}
              options={[
                { value: 'storm', label: 'Stormiest' },
                { value: 'temp', label: 'Hottest' },
                { value: 'name', label: 'A–Z' },
              ]}
            />
          </>
        }
      >
        <div className="matrix-scroll">
          <table className="matrix">
            <thead>
              <tr>
                <th className="matrix-name">Location</th>
                {model.dates.map((d) => (
                  <th key={d} className={d === day ? 'is-day' : ''}>
                    <button onClick={() => setDay(d)}>
                      {fmtDay(d)}
                      <small>{fmtDate(d)}</small>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pager.items.map((l) => (
                <tr key={l.id} className={l.id === selectedId ? 'is-sel' : ''} onClick={() => setSelectedId(l.id)}>
                  <td className="matrix-name">
                    <span>{l.name}</span>
                    {l.type !== 'St' && l.state ? <small>{l.state}</small> : null}
                  </td>
                  {model.dates.map((d) => {
                    const r = l.days[d];
                    if (!r) return <td key={d} />;
                    // The ramp runs light->dark in light mode and dark->light in dark mode.
                    const dark = r.cond.level >= 0 && (theme.mode === 'light' ? r.cond.level >= 2 : r.cond.level <= 2);
                    return (
                      <td key={d} className={d === day ? 'is-day' : ''}>
                        <span
                          className={`cell ${dark ? 'on-dark' : 'on-light'}`}
                          style={{ background: rainColor(theme, r.cond) }}
                          title={`${r.cond.english} · ${r.min_temp}–${r.max_temp}°C`}
                        >
                          {r.max_temp}°
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {!visible.length ? <p className="empty">No locations match “{query}”.</p> : null}
        </div>
        <Pager pager={pager} noun={LAYER_LABEL[layer].toLowerCase()} sizes={[20, 50, 100]} />
      </Card>
    </div>
  );
}

function LocationDetail({ loc, day, dates, onDay }) {
  const { theme } = useTheme();
  if (!loc) return <Card className="detail" title="Location" subtitle="Select a location on the map." />;
  const r = loc.days[day];
  const temps = dates.map((d) => loc.days[d]).filter(Boolean);
  const lo = Math.min(...temps.map((t) => t.min_temp));
  const hi = Math.max(...temps.map((t) => t.max_temp));

  return (
    <Card className="detail">
      <div className="detail-head">
        <span className="detail-type">{LOCATION_TYPES[loc.type]}</span>
        <h2>{loc.name}</h2>
        {loc.type !== 'St' && loc.state ? <p>{loc.state}</p> : null}
      </div>

      {r ? (
        <div className="detail-now">
          <span className="detail-icon" style={{ background: rainColor(theme, r.cond) }} aria-hidden="true">
            {r.cond.icon}
          </span>
          <div>
            <div className="detail-cond">{r.cond.english}</div>
            <div className="detail-bm" lang="ms">
              {r.summary_forecast}
              {r.summary_when ? ` · ${translateWhen(r.summary_when)}` : ''}
            </div>
            <div className="detail-temp">
              <strong>{r.max_temp}°</strong>
              <span>/ {r.min_temp}°C</span>
            </div>
          </div>
        </div>
      ) : null}

      {r ? (
        <div className="periods">
          {[
            ['Morning', r.morning],
            ['Afternoon', r.afternoon],
            ['Night', r.night],
          ].map(([label, c]) => (
            <div className="period" key={label}>
              <span className="period-label">{label}</span>
              <span className="period-dot" style={{ background: rainColor(theme, c) }} />
              <span className="period-text">{c.english}</span>
            </div>
          ))}
        </div>
      ) : null}

      <ol className="week">
        {dates.map((d) => {
          const x = loc.days[d];
          if (!x) return null;
          const left = ((x.min_temp - lo) / (hi - lo || 1)) * 100;
          const width = ((x.max_temp - x.min_temp) / (hi - lo || 1)) * 100;
          return (
            <li key={d} className={d === day ? 'is-on' : ''}>
              <button onClick={() => onDay(d)}>
                <span className="week-day">{d === todayMYT() ? 'Today' : fmtDay(d)}</span>
                <span className="week-dot" style={{ background: rainColor(theme, x.cond) }} title={x.cond.english} />
                <span className="week-min">{x.min_temp}°</span>
                <span className="week-bar">
                  <span style={{ left: `${left}%`, width: `${Math.max(width, 4)}%` }} />
                </span>
                <span className="week-max">{x.max_temp}°</span>
              </button>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
