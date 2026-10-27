import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, GeoJSON, Tooltip as MapTip } from 'react-leaflet';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import BaseMap from '../components/BaseMap.jsx';
import { Card, ChartTooltip, Key, Loading, Pager, Segmented, StatTile } from '../components/ui.jsx';
import { usePagination } from '../lib/usePagination.js';
import { DEPTH_CLASSES, quakeRadius } from '../lib/quakes.js';
import { loadStates } from '../lib/geo.js';
import { fmtDateTime, timeAgo } from '../lib/format.js';
import { useTheme } from '../lib/theme.jsx';

const PERIODS = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 0, label: 'All' },
];
const MAGS = [
  { value: 0, label: 'All' },
  { value: 4, label: 'M4+' },
  { value: 5, label: 'M5+' },
  { value: 6, label: 'M6+' },
];
const REGION = [
  { value: 'all', label: 'Whole region' },
  { value: 'near', label: '< 1,000 km of Malaysia' },
];

// Wide view of the MET monitoring region (SE Asia & western Pacific)
const REGION_BOUNDS = [
  [-12, 90],
  [26, 135],
];

export default function EarthquakePage({ state, quakes }) {
  const { theme } = useTheme();
  const [statesGeo, setStatesGeo] = useState(null);
  const [period, setPeriod] = useState(30);
  const [minMag, setMinMag] = useState(0);
  const [region, setRegion] = useState('all');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    loadStates().then(setStatesGeo);
  }, []);

  const list = useMemo(() => {
    if (!quakes) return [];
    const since = period ? Date.now() - period * 864e5 : 0;
    return quakes.filter(
      (q) => q.time >= since && (q.magdefault ?? 0) >= minMag && (region === 'all' || (q.distMy != null && q.distMy < 1000)),
    );
  }, [quakes, period, minMag, region]);
  const pager = usePagination(list, { pageSize: 20, resetKey: `${period}-${minMag}-${region}` });

  // An event picked on the map or chart jumps the log to its page.
  const [jumpTo, setJumpTo] = useState(null);
  useEffect(() => {
    if (jumpTo) pager.reveal((q) => q === jumpTo.q);
  }, [jumpTo]);
  const pick = (q) => {
    setSelected(q);
    setJumpTo({ q });
  };

  if (!quakes) return state.error ? null : <Loading />;

  const strongest = list.reduce((a, q) => (!a || q.magdefault > a.magdefault ? q : a), null);
  const nearest = list.reduce((a, q) => (q.distMy != null && (!a || q.distMy < a.distMy) ? q : a), null);
  const latest = list[0];
  const oldest = quakes[quakes.length - 1];

  // Magnitude distribution in half-unit bins
  const bins = new Map();
  for (const q of list) {
    const b = Math.floor((q.magdefault ?? 0) * 2) / 2;
    bins.set(b, (bins.get(b) ?? 0) + 1);
  }
  const lo = Math.min(...bins.keys(), 3);
  const hi = Math.max(...bins.keys(), 6);
  const histogram = [];
  for (let b = lo; b <= hi; b += 0.5) histogram.push({ bin: b, label: `${b.toFixed(1)}`, count: bins.get(b) ?? 0 });

  const timeline = list.map((q) => ({ t: q.time.getTime(), mag: q.magdefault, depth: q.depth, q }));
  const tick = { fill: theme.muted, fontSize: 12 };
  const depthColor = (i) => theme.depth[i] ?? theme.depth[0];

  return (
    <div className="page">
      <div className="toolbar">
        <Segmented label="Period" value={period} onChange={setPeriod} options={PERIODS} />
        <Segmented label="Minimum magnitude" value={minMag} onChange={setMinMag} options={MAGS} />
        <Segmented label="Region" value={region} onChange={setRegion} options={REGION} />
      </div>

      <div className="stats">
        <StatTile label="Events" value={list.length} sub={`of ${quakes.length} since ${fmtDateTime(oldest?.time)}`} />
        <StatTile
          label="Strongest"
          value={strongest ? strongest.magdefault.toFixed(1) : '—'}
          unit={strongest ? ` ${strongest.magtypedefault}` : ''}
          sub={strongest?.location_original}
          tone="alert"
        />
        <StatTile label="Nearest to Malaysia" value={nearest ? nearest.distMy.toLocaleString() : '—'} unit=" km" sub={nearest?.n_distancemas} />
        <StatTile label="Latest" value={latest ? timeAgo(latest.time) : '—'} sub={latest ? `M${latest.magdefault} · ${latest.location_original}` : ''} />
      </div>

      <div className="grid-map">
        <Card
          className="card-map"
          title="Seismic events"
          subtitle="Circle size = magnitude, colour = depth. Malaysia outlined."
          legend={DEPTH_CLASSES.map((c, i) => (
            <Key key={c.key} color={depthColor(i)} label={c.label} shape="dot" />
          ))}
        >
          <BaseMap bounds={REGION_BOUNDS} minZoom={3}>
            {statesGeo ? (
              <GeoJSON
                key={`eq-${theme.mode}`}
                data={statesGeo}
                style={{ color: theme.ink2, weight: 1, fillColor: theme.land, fillOpacity: 0.3 }}
                interactive={false}
              />
            ) : null}
            {[...list]
              .sort((a, b) => b.magdefault - a.magdefault)
              .map((q) => {
                const isSel = selected === q;
                return (
                  <CircleMarker
                    key={`${q.utcdatetime}-${q.lat}-${theme.mode}-${isSel}`}
                    center={[q.lat, q.lon]}
                    radius={quakeRadius(q.magdefault)}
                    pathOptions={{
                      color: isSel ? theme.ink : theme.surface,
                      weight: isSel ? 3 : 1.5,
                      fillColor: depthColor(q.depthIdx),
                      fillOpacity: 0.85,
                    }}
                    eventHandlers={{ click: () => pick(q) }}
                  >
                    <MapTip className="map-tip" direction="top">
                      <strong>M{q.magdefault}</strong> · {q.location_original}
                      <br />
                      {fmtDateTime(q.time)} · depth {q.depth} km
                      <br />
                      {q.n_distancemas}
                    </MapTip>
                  </CircleMarker>
                );
              })}
          </BaseMap>
        </Card>

        <section className="card quake-list">
          <header className="card-head">
            <div>
              <h2>Event log</h2>
              <p>{list.length} events · newest first</p>
            </div>
          </header>
          <div className="warn-scroll">
            {pager.items.map((q) => (
              <button key={`${q.utcdatetime}-${q.lat}`} className={`quake ${selected === q ? 'is-sel' : ''}`} onClick={() => setSelected(q)}>
                <span className="quake-mag" style={{ borderColor: depthColor(q.depthIdx) }}>
                  {q.magdefault.toFixed(1)}
                </span>
                <span className="quake-body">
                  <strong>{q.location_original}</strong>
                  <small>
                    {fmtDateTime(q.time)} · {q.depth} km deep
                  </small>
                  <small>{q.n_distancemas}</small>
                </span>
              </button>
            ))}
            {!list.length ? <p className="empty">No events match these filters.</p> : null}
          </div>
          <Pager pager={pager} noun="events" />
        </section>
      </div>

      <div className="grid-2">
        <Card title="Magnitude over time" subtitle="Each dot is one event, coloured by depth.">
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
              <CartesianGrid stroke={theme.grid} vertical={false} />
              <XAxis
                type="number"
                dataKey="t"
                domain={['dataMin', 'dataMax']}
                tick={tick}
                tickFormatter={(t) => new Date(t).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })}
                axisLine={{ stroke: theme.axis }}
                tickLine={false}
                scale="time"
              />
              <YAxis
                type="number"
                dataKey="mag"
                domain={[(m) => Math.floor(m), (m) => Math.ceil(m)]}
                allowDecimals={false}
                tick={tick}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `M${v}`}
              />
              <ZAxis range={[64, 64]} />
              <Tooltip
                cursor={{ stroke: theme.axis }}
                content={
                  <ChartTooltip
                    labelFormatter={(_, p) => p[0]?.payload.q.location_original}
                    rows={(p) => [
                      { color: depthColor(p[0].payload.q.depthIdx), name: 'magnitude', value: `M${p[0].payload.mag}` },
                      { name: 'depth', value: `${p[0].payload.depth} km` },
                      { name: 'MYT', value: fmtDateTime(p[0].payload.q.time) },
                    ]}
                  />
                }
              />
              <Scatter data={timeline} onClick={(d) => pick(d.q)} style={{ cursor: 'pointer' }}>
                {timeline.map((d, i) => (
                  <Cell key={i} fill={depthColor(d.q.depthIdx)} stroke={theme.surface} strokeWidth={1.5} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Magnitude distribution" subtitle="Events per half-magnitude band.">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={histogram} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barCategoryGap={2}>
              <CartesianGrid vertical={false} stroke={theme.grid} />
              <XAxis dataKey="label" tick={tick} axisLine={{ stroke: theme.axis }} tickLine={false} />
              <YAxis tick={tick} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: theme.grid, fillOpacity: 0.5 }}
                content={
                  <ChartTooltip
                    labelFormatter={(l) => `M${l} – ${(Number(l) + 0.5).toFixed(1)}`}
                    rows={(p) => [{ color: theme.series1, name: 'events', value: p[0].value }]}
                  />
                }
              />
              <Bar dataKey="count" fill={theme.series1} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}
