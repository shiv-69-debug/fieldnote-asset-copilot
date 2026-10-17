export const day = value => String(value).slice(0, 10);
export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '') || new Date(value).toISOString().slice(0, 10) !== value) throw Error('Use a valid date in YYYY-MM-DD format.');
  return value;
}
export function shift(date, amount, unit) {
  const d = new Date(validDate(day(date)) + 'T00:00:00Z');
  if (unit === 'months' || unit === 'years') {
    const originalDay = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + amount * (unit === 'years' ? 12 : 1));
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(originalDay, last));
  } else d.setUTCDate(d.getUTCDate() + amount * (unit === 'weeks' ? 7 : 1));
  return day(d.toISOString());
}
export function windowFor(period, today) {
  validDate(today);
  if (!period) return { start: '0001-01-01', end: today };
  if (period.start || period.end) {
    const range = { start: validDate(period.start || '0001-01-01'), end: validDate(period.end || today) };
    if (range.start > range.end) throw Error('The start date must be on or before the end date.');
    return range;
  }
  if (period.year) return { start: `${period.year}-01-01`, end: `${period.year}` === today.slice(0, 4) ? today : `${period.year}-12-31` };
  if (!Number.isInteger(period.count) || period.count < 1 || !['days', 'weeks', 'months', 'years'].includes(period.unit)) throw Error('Invalid date period.');
  return { start: shift(today, -period.count, period.unit), end: today };
}
export const within = (value, range) => day(value) >= range.start && day(value) <= range.end;
export const addHours = (date, hours) => new Date(new Date(date).getTime() + hours * 3600000).toISOString();
export const prettyDate = value => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
