import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, GeoJSON, Tooltip as MapTip } from 'react-leaflet';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import BaseMap from '../components/BaseMap.jsx';
import { Card, ChartTooltip, Key, Loading, Pager, Segmented, StatTile, StatusChip } from '../components/ui.jsx';
import { usePagination } from '../lib/usePagination.js';
import { SEVERITY, mytDate } from '../lib/warnings.js';
import { loadStates, locationPoint } from '../lib/geo.js';
import { fmtDateTime, timeAgo, timeLeft } from '../lib/format.js';
import { useTheme } from '../lib/theme.jsx';

const STATUS_LABEL = { active: 'In force', upcoming: 'Upcoming', expired: 'Expired', info: 'Bulletin' };

export default function WarningsPage({ state, warnings }) {
  const { theme } = useTheme();
  const [statesGeo, setStatesGeo] = useState(null);
  const [selectedKey, setSelectedKey] = useState(null);
  const [lang, setLang] = useState('en');
  const [showExpired, setShowExpired] = useState(false);

  useEffect(() => {
    loadStates().then(setStatesGeo);
  }, []);

  const live = useMemo(() => warnings?.filter((w) => w.status === 'active' || w.status === 'upcoming') ?? [], [warnings]);
  const listed = useMemo(
    () =>
      (warnings ?? [])
        .filter((w) => showExpired || w.status !== 'expired')
        .sort((a, b) => SEVERITY[b.severity].rank - SEVERITY[a.severity].rank || (b.warning_issue.issued > a.warning_issue.issued ? 1 : -1)),
    [warnings, showExpired],
  );
  const pager = usePagination(listed, { pageSize: 10, resetKey: showExpired });

  if (!warnings) return state.error ? null : <Loading />;

  const selected = warnings.find((w) => w.key === selectedKey);
  const mapped = selected ? [selected] : live;

  // Highest severity per state / place among the mapped warnings
  const stateSev = new Map();
  const placeSev = new Map();
  for (const w of mapped) {
    for (const s of w.areas.states) {
      if (SEVERITY[w.severity].rank > SEVERITY[stateSev.get(s)?.severity ?? 'good'].rank) stateSev.set(s, w);
    }
    for (const p of w.areas.places) {
      if (!placeSev.has(p.id) || SEVERITY[w.severity].rank > SEVERITY[placeSev.get(p.id).w.severity].rank) placeSev.set(p.id, { ...p, w });
    }
  }

  const statesHit = new Set(live.flatMap((w) => w.areas.states));
  const placesHit = new Set(live.flatMap((w) => w.areas.places.map((p) => p.id)));
  const latest = warnings.reduce((a, w) => (!a || w.warning_issue.issued > a.warning_issue.issued ? w : a), null);

  const perState = [...statesHit]
    .map((s) => ({ state: s, count: live.filter((w) => w.areas.states.includes(s)).length, places: live.flatMap((w) => w.areas.places).filter((p) => p.state === s).length }))
    .sort((a, b) => b.count - a.count || b.places - a.places);

  const severities = ['warning', 'serious', 'critical'];
  const tick = { fill: theme.muted, fontSize: 12 };

  return (
    <div className="page">
      <div className="stats">
        <StatTile label="Warnings in force" value={live.length} sub={`${warnings.length} bulletins published by MET`} tone={live.length ? 'alert' : undefined} />
        <StatTile label="States affected" value={statesHit.size} unit="/ 16" sub={[...statesHit].join(', ') || 'None'} />
        <StatTile label="Districts named" value={placesHit.size} sub="Matched to forecast locations" />
        <StatTile label="Latest bulletin" value={timeAgo(mytDate(latest?.warning_issue.issued))} sub={latest?.warning_issue.title_en} />
      </div>

      <div className="grid-map">
        <Card
          className="card-map"
          title={selected ? selected.warning_issue.title_en : 'Areas under warning'}
          subtitle={
            selected
              ? `${selected.areas.states.length} states · ${selected.areas.places.length} named districts. Click the card again to show all.`
              : 'States and districts named in warnings currently in force, by highest severity.'
          }
          legend={severities.map((s) => (
            <Key key={s} color={theme.status[s]} label={`${SEVERITY[s].icon} ${SEVERITY[s].label}`} />
          ))}
        >
          <BaseMap>
            {statesGeo ? (
              <GeoJSON
                key={`w-${selectedKey}-${theme.mode}-${live.length}`}
                data={statesGeo}
                style={(f) => {
                  const w = stateSev.get(f.properties.shapeName);
                  return w
                    ? { color: theme.surface, weight: 1, fillColor: theme.status[w.severity], fillOpacity: 0.55 }
                    : { color: theme.axis, weight: 1, fillColor: theme.land, fillOpacity: 0.25 };
                }}
                onEachFeature={(f, lyr) => {
                  const ws = mapped.filter((w) => w.areas.states.includes(f.properties.shapeName));
                  if (ws.length) {
                    lyr.bindTooltip(`<strong>${f.properties.shapeName}</strong><br/>${ws.map((w) => w.warning_issue.title_en).join('<br/>')}`, {
                      sticky: true,
                      className: 'map-tip',
                    });
                  }
                }}
              />
            ) : null}
            {[...placeSev.values()].map((p) => {
              const pt = locationPoint(p.id);
              if (!pt) return null;
              return (
                <CircleMarker
                  key={`${p.id}-${theme.mode}-${selectedKey}`}
                  center={pt}
                  radius={6}
                  pathOptions={{ color: theme.surface, weight: 1.5, fillColor: theme.status[p.w.severity], fillOpacity: 1 }}
                >
                  <MapTip className="map-tip" direction="top" offset={[0, -5]}>
                    <strong>{p.name}</strong>, {p.state}
                    <br />
                    {p.w.warning_issue.title_en}
                  </MapTip>
                </CircleMarker>
              );
            })}
          </BaseMap>
        </Card>

        <section className="card warn-list">
          <header className="card-head">
            <div>
              <h2>Bulletins</h2>
              <p>Most severe first</p>
            </div>
            <div className="card-actions">
              <Segmented
                label="Language"
                value={lang}
                onChange={setLang}
                options={[
                  { value: 'en', label: 'EN' },
                  { value: 'bm', label: 'BM' },
                ]}
              />
            </div>
          </header>
          <div className="warn-scroll">
            {pager.items.map((w) => (
              <WarningCard key={w.key} w={w} lang={lang} selected={w.key === selectedKey} onSelect={() => setSelectedKey(w.key === selectedKey ? null : w.key)} />
            ))}
            {!listed.length ? <p className="empty">No bulletins right now.</p> : null}
            {warnings.some((w) => w.status === 'expired') ? (
              <button className="link-btn" onClick={() => setShowExpired((v) => !v)}>
                {showExpired ? 'Hide expired' : 'Show expired'}
              </button>
            ) : null}
          </div>
          <Pager pager={pager} noun="bulletins" sizes={[5, 10, 20]} />
        </section>
      </div>

      <Card title="Exposure by state" subtitle="Warnings in force that name each state.">
        {perState.length ? (
          <ResponsiveContainer width="100%" height={Math.max(160, perState.length * 30 + 30)}>
            <BarChart data={perState} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 0 }}>
              <CartesianGrid horizontal={false} stroke={theme.grid} />
              <XAxis type="number" allowDecimals={false} tick={tick} axisLine={{ stroke: theme.axis }} tickLine={false} />
              <YAxis type="category" dataKey="state" width={120} tick={tick} axisLine={false} tickLine={false} interval={0} />
              <Tooltip
                cursor={{ fill: theme.grid, fillOpacity: 0.5 }}
                content={
                  <ChartTooltip
                    rows={(p) => [
                      { color: theme.series1, name: 'warnings', value: p[0].payload.count },
                      { name: 'named districts', value: p[0].payload.places },
                    ]}
                  />
                }
              />
              <Bar dataKey="count" fill={theme.series1} radius={[0, 4, 4, 0]} maxBarSize={18}>
                <LabelList dataKey="count" position="right" fill={theme.ink2} fontSize={12} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="empty">No state is under a land warning right now.</p>
        )}
      </Card>
    </div>
  );
}

function WarningCard({ w, lang, selected, onSelect }) {
  const from = mytDate(w.valid_from);
  const to = mytDate(w.valid_to);
  const now = Date.now();
  const progress = from && to ? Math.min(100, Math.max(0, ((now - from) / (to - from)) * 100)) : null;
  const text = lang === 'en' ? w.text_en : w.text_bm;
  const instruction = lang === 'en' ? w.instruction_en : w.instruction_bm;
  const title = lang === 'en' ? w.warning_issue.title_en : w.warning_issue.title_bm;
  const sev = SEVERITY[w.severity];

  return (
    <article className={`warn sev-${w.severity} ${selected ? 'is-sel' : ''} ${w.status === 'expired' ? 'is-expired' : ''}`}>
      <button className="warn-hit" onClick={onSelect} aria-pressed={selected}>
        <div className="warn-top">
          <StatusChip severity={w.severity} icon={sev.icon} label={sev.label} />
          <span className={`warn-status st-${w.status}`}>{STATUS_LABEL[w.status]}</span>
        </div>
        <h3>{title}</h3>
        <p className="warn-meta">Issued {fmtDateTime(mytDate(w.warning_issue.issued))}</p>
        {progress != null ? (
          <div className="validity">
            <div className="validity-bar">
              <span style={{ width: `${progress}%` }} />
            </div>
            <div className="validity-labels">
              <span>{fmtDateTime(from)}</span>
              <span>{w.status === 'active' ? timeLeft(to) : w.status === 'upcoming' ? `starts ${fmtDateTime(from)}` : 'ended'}</span>
              <span>{fmtDateTime(to)}</span>
            </div>
          </div>
        ) : null}
      </button>
      <p className="warn-text" lang={lang === 'bm' ? 'ms' : 'en'}>
        {text}
      </p>
      {instruction ? <p className="warn-instr">{instruction}</p> : null}
      {!w.areas.states.length && /waters of/i.test(w.text_en ?? '') ? (
        <div className="warn-tags">
          <span className="tag">Marine · sea areas only, not mapped</span>
        </div>
      ) : null}
      {w.areas.states.length ? (
        <div className="warn-tags">
          {w.areas.states.map((s) => (
            <span className="tag" key={s}>
              {s}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}
