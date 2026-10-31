import { addDays, addPeriod } from '../../lib/dates.js';
import { HttpError } from '../../lib/errors.js';

const dayNumber = value => Date.parse(value + 'T00:00:00Z') / 86400000;
const calendarDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && value >= '1900-01-01' && Number.isFinite(dayNumber(value))
  && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;

// Always count from the original start: Jan 31 -> Feb 28 -> Mar 31.
export function billingWindow({ start_date, next_billing_date, expiry_date }, period) {
  if (![start_date, next_billing_date, ...(expiry_date ? [expiry_date] : [])].every(calendarDate)
    || next_billing_date < start_date || (expiry_date && next_billing_date > expiry_date))
    throw new HttpError(409, 'Subscription has an invalid billing date');
  const start = next_billing_date;
  const elapsedDays = dayNumber(start) - dayNumber(start_date);
  const elapsedMonths = (Number(start.slice(0, 4)) - Number(start_date.slice(0, 4))) * 12
    + Number(start.slice(5, 7)) - Number(start_date.slice(5, 7));
  const periods = { DAILY: elapsedDays, WEEKLY: Math.floor(elapsedDays / 7),
    MONTHLY: elapsedMonths, YEARLY: Math.floor(elapsedMonths / 12) };
  if (!(period in periods)) throw new HttpError(409, 'Unknown billing period');
  let count = periods[period];
  let next = addPeriod(start_date, period, count);
  if (next <= start) next = addPeriod(start_date, period, ++count);
  if (!calendarDate(next) || next <= start) throw new HttpError(409, 'Billing date exceeds the supported calendar');
  const normalEnd = addDays(next, -1);
  const end = expiry_date && expiry_date < normalEnd ? expiry_date : normalEnd;
  return { period_start: start, period_end: end, next_billing_date: next,
    billable_days: dayNumber(end) - dayNumber(start) + 1,
    period_days: dayNumber(next) - dayNumber(start) };
}
