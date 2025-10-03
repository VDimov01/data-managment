export function formatDateDMYLocal(value, { tz = 'Europe/Sofia', fallback = '—' } = {}) {
  if (!value) return fallback;
  const d = (value instanceof Date) ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return new Intl.DateTimeFormat('bg-BG', {
    timeZone: tz,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(d);
}

// Formats date-like values by ignoring time and timezone (use for ETA: DATE columns)
export function formatDateDMYDateOnly(value, { fallback = '—' } = {}) {
  if (!value) return fallback;
  // Accept 'YYYY-MM-DD', Date, or ISO string; always reduce to the date part.
  let ymd;
  if (typeof value === 'string') {
    // grab first 10 chars if ISO, or whole string if it's already YYYY-MM-DD
    const s = value.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return fallback;
    ymd = s;
  } else if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // convert to YYYY-MM-DD in UTC (so we don’t shift days by TZ)
    ymd = value.toISOString().slice(0, 10);
  } else {
    return fallback;
  }
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`; // dd/mm/yyyy
}

// Nice-to-have range formatter (handles nulls)
export function formatDateRangeDMY(start, end, { dateOnly = true } = {}) {
  const fmt = dateOnly ? formatDateDMYDateOnly : formatDateDMYLocal;
  const a = fmt(start), b = fmt(end);
  if (a === '—' && b === '—') return '—';
  if (a !== '—' && b !== '—') return `${a} – ${b}`;
  return a !== '—' ? a : b;
}