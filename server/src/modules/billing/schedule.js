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
  if (!Object.hasOwn(periods, period)) throw new HttpError(409, 'Unknown billing period');
  const count = periods[period];
  const boundary = addPeriod(start_date, period, count);
  const cycleStart = boundary > start ? addPeriod(start_date, period, count - 1) : boundary;
  const next = boundary > start ? boundary : addPeriod(start_date, period, count + 1);
  if (!calendarDate(next) || next <= start) throw new HttpError(409, 'Billing date exceeds the supported calendar');
  const normalEnd = addDays(next, -1);
  const end = expiry_date && expiry_date < normalEnd ? expiry_date : normalEnd;
  // A renewed partial period resumes the day after the last covered day, while
  // its denominator and later boundaries still refer to the original cycle.
  return { period_start: start, period_end: end, next_billing_date: addDays(end, 1),
    billable_days: dayNumber(end) - dayNumber(start) + 1,
    period_days: dayNumber(next) - dayNumber(cycleStart) };
}
