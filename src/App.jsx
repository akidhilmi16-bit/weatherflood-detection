import { useEffect, useMemo, useState } from 'react';
import { useEndpoint } from './lib/useWeatherData.js';
import { useTheme } from './lib/theme.jsx';
import { enrichWarnings } from './lib/warnings.js';
import { enrichQuakes } from './lib/quakes.js';
import { buildRisk } from './lib/floodRisk.js';
import { timeAgo } from './lib/format.js';
import ForecastPage from './pages/ForecastPage.jsx';
import WarningsPage from './pages/WarningsPage.jsx';
import EarthquakePage from './pages/EarthquakePage.jsx';
import DangerZonePage from './pages/DangerZonePage.jsx';

const TABS = [
  { id: 'forecast', label: 'Forecast', hint: '7-day outlook' },
  { id: 'warnings', label: 'Warnings', hint: 'Active alerts' },
  { id: 'earthquakes', label: 'Earthquakes', short: 'Quakes', hint: 'Regional seismic' },
  { id: 'danger', label: 'Danger Zone', short: 'Danger', hint: 'Flood risk index' },
];

const tabFromHash = () => {
  const id = window.location.hash.replace('#/', '');
  return TABS.some((t) => t.id === id) ? id : 'forecast';
};

export default function App() {
  const { mode, toggle } = useTheme();
  const [tab, setTab] = useState(tabFromHash);
  const forecast = useEndpoint('forecast');
  const warningsRaw = useEndpoint('warnings');
  const quakesRaw = useEndpoint('earthquakes');

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const warnings = useMemo(() => (warningsRaw.data ? enrichWarnings(warningsRaw.data) : null), [warningsRaw.data]);
  const quakes = useMemo(() => (quakesRaw.data ? enrichQuakes(quakesRaw.data) : null), [quakesRaw.data]);
  const risk = useMemo(() => (forecast.data ? buildRisk(forecast.data, warnings ?? []) : null), [forecast.data, warnings]);

  const activeWarnings = warnings?.filter((w) => w.status === 'active' || w.status === 'upcoming').length ?? 0;
  const quakes24h = quakes?.filter((q) => Date.now() - q.time < 864e5).length ?? 0;
  const dangerZones = risk?.zones.filter((z) => z.peak.score >= 50).length ?? 0;
  const badges = { forecast: null, warnings: activeWarnings || null, earthquakes: quakes24h || null, danger: dangerZones || null };

  const current = { forecast, warnings: warningsRaw, earthquakes: quakesRaw, danger: forecast }[tab];
  const fetchedAt = current.fetchedAt ? new Date(current.fetchedAt) : null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="30" height="30">
              <rect width="32" height="32" rx="9" fill="#0d366b" />
              <path d="M9 19.5a5 5 0 0 1 1-9.9A7 7 0 0 1 23.5 11.5 4 4 0 0 1 23 19.5Z" fill="#cde2fb" />
              <path d="M12 23l-1 3M17 23l-1 3M22 23l-1 3" stroke="#86b6ef" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <h1>Monsoon Desk</h1>
            <p>Malaysia live weather intelligence</p>
          </div>
        </div>

        <nav className="tabs" role="tablist" aria-label="Data views">
          {TABS.map((t) => (
            <a
              key={t.id}
              href={`#/${t.id}`}
              role="tab"
              aria-selected={tab === t.id}
              className={`tab ${tab === t.id ? 'is-active' : ''}`}
            >
              <span className="tab-label">
                <span className={t.short ? 'tab-full' : undefined}>{t.label}</span>
                {t.short ? <span className="tab-short">{t.short}</span> : null}
                {badges[t.id] ? <span className="tab-badge">{badges[t.id]}</span> : null}
              </span>
              <span className="tab-hint">{t.hint}</span>
            </a>
          ))}
        </nav>

        <div className="topbar-actions">
          <span className={`freshness ${current.stale ? 'is-stale' : ''}`} title={fetchedAt?.toString()}>
            <span className="pulse" aria-hidden="true" />
            {current.loading && !fetchedAt ? 'Loading…' : current.stale ? `Cached · ${timeAgo(fetchedAt)}` : `Updated ${timeAgo(fetchedAt)}`}
          </span>
          <button className="icon-btn" onClick={current.reload} disabled={current.loading} title="Refresh this view">
            <span className={current.loading ? 'spin' : ''} aria-hidden="true">↻</span>
            <span className="sr-only">Refresh</span>
          </button>
          <button className="icon-btn" onClick={toggle} title={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}>
            <span aria-hidden="true">{mode === 'dark' ? '☀' : '☾'}</span>
            <span className="sr-only">Toggle theme</span>
          </button>
        </div>
      </header>

      {current.error ? (
        <div className={`banner ${current.data ? 'is-warn' : 'is-error'}`} role="status">
          {current.data ? `Showing cached data — ${current.error}` : current.error}
        </div>
      ) : null}

      <main className="content">
        {tab === 'forecast' && <ForecastPage state={forecast} />}
        {tab === 'warnings' && <WarningsPage state={warningsRaw} warnings={warnings} />}
        {tab === 'earthquakes' && <EarthquakePage state={quakesRaw} quakes={quakes} />}
        {tab === 'danger' && <DangerZonePage state={forecast} risk={risk} />}
      </main>

      <footer className="footer">
        <span>
          Data: <a href="https://developer.data.gov.my/realtime-api/weather" target="_blank" rel="noreferrer">MET Malaysia via data.gov.my</a> (CC BY 4.0)
          · Basemap © Esri, HERE, Garmin, © OpenStreetMap contributors · Geocoding © OpenStreetMap (Nominatim)
        </span>
        <span className="footer-v2">v2 · live data · rule-based flood-risk index (indicative)</span>
      </footer>
    </div>
  );
}
