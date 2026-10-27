const MYT = 'Asia/Kuala_Lumpur';

export const fmtDay = (iso) =>
  new Date(`${iso}T00:00:00+08:00`).toLocaleDateString('en-MY', { weekday: 'short', timeZone: MYT });

export const fmtDate = (iso) =>
  new Date(`${iso}T00:00:00+08:00`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', timeZone: MYT });

export const fmtDateTime = (d) =>
  d
    ? d.toLocaleString('en-MY', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: MYT })
    : '—';

/** Like fmtDateTime, but adds the year when it isn't this year. */
export const fmtDateTimeYear = (d) =>
  d && d.getFullYear() !== new Date().getFullYear()
    ? d.toLocaleString('en-MY', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: MYT })
    : fmtDateTime(d);

export function timeAgo(d, now = Date.now()) {
  if (!d) return '—';
  const s = Math.round((now - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export function timeLeft(d, now = Date.now()) {
  if (!d) return '';
  const m = Math.round((d.getTime() - now) / 60000);
  if (m <= 0) return 'ended';
  if (m < 60) return `${m} min left`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ${m % 60} min left`;
  return `${Math.round(h / 24)} days left`;
}

export const todayMYT = () => new Date().toLocaleDateString('en-CA', { timeZone: MYT });
