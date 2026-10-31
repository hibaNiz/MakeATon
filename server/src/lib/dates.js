// Date helpers working on 'YYYY-MM-DD' strings (no time-zone surprises).
const toDate = (s) => new Date(s + 'T00:00:00Z');
const toStr = (d) => d.toISOString().slice(0, 10);

export const today = () => new Date().toISOString().slice(0, 10);

export function addDays(s, n) {
  const d = toDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toStr(d);
}

// Add one billing period. Months keep the same day where possible (Jan 31 -> Feb 28).
export function addPeriod(s, period, count = 1) {
  const d = toDate(s);
  if (period === 'DAILY') d.setUTCDate(d.getUTCDate() + count);
  else if (period === 'WEEKLY') d.setUTCDate(d.getUTCDate() + 7 * count);
  else {
    const months = period === 'YEARLY' ? 12 * count : count;
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + months);
    const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, lastDay));
  }
  return toStr(d);
}

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
