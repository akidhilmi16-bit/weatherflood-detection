// Small presentational building blocks shared by all pages.

export function StatTile({ label, value, unit, sub, tone }) {
  return (
    <div className={`stat ${tone ? `tone-${tone}` : ''}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        {value}
        {unit ? <span className="stat-unit">{unit}</span> : null}
      </span>
      {sub ? <span className="stat-sub">{sub}</span> : null}
    </div>
  );
}

export function Card({ title, subtitle, actions, legend, className = '', children }) {
  return (
    <section className={`card ${className}`}>
      {title || actions ? (
        <header className="card-head">
          <div>
            {title ? <h2>{title}</h2> : null}
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {actions ? <div className="card-actions">{actions}</div> : null}
        </header>
      ) : null}
      {legend ? <div className="legend">{legend}</div> : null}
      {children}
    </section>
  );
}

/** Legend key. `shape` mirrors the mark: rect for fills/bars, dot for points, line for lines. */
export function Key({ color, label, shape = 'rect', ring }) {
  return (
    <span className="key">
      <span className={`key-swatch key-${shape}`} style={{ background: color, boxShadow: ring ? `0 0 0 1px ${ring}` : undefined }} />
      {label}
    </span>
  );
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'is-on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.count != null ? <span className="seg-count">{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function StatusChip({ severity, label, icon }) {
  return (
    <span className={`chip chip-${severity}`}>
      <span className="chip-icon" aria-hidden="true">
        {icon}
      </span>
      {label}
    </span>
  );
}

/** Recharts tooltip: value leads, label follows; series keyed by a short line. */
export function ChartTooltip({ active, payload, label, labelFormatter, rows }) {
  if (!active || !payload?.length) return null;
  const items = rows ? rows(payload) : payload.map((p) => ({ color: p.color ?? p.fill, name: p.name, value: p.value }));
  return (
    <div className="tip">
      <div className="tip-title">{labelFormatter ? labelFormatter(label, payload) : label}</div>
      {items.map((it, i) => (
        <div className="tip-row" key={i}>
          {it.color ? <span className="tip-key" style={{ background: it.color }} /> : null}
          <strong>{it.value}</strong>
          <span>{it.name}</span>
        </div>
      ))}
    </div>
  );
}

export function Loading({ label = 'Loading live data…' }) {
  return (
    <div className="loading">
      <span className="loading-bar" />
      {label}
    </div>
  );
}
