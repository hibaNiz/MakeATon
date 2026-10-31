import { query } from '../../lib/db.js';
import { today, addPeriod } from '../../lib/dates.js';
import { dashboardFilters } from './validation.js';

export async function getDashboard(filters = {}) {
  const { months } = dashboardFilters.parse(filters);
  const asOf = today();
  const from = addPeriod(asOf.slice(0, 7) + '-01', 'MONTHLY', 1 - months);
  const { rows: [row] } = await query(`
    WITH month_list AS (
      SELECT d::date AS month FROM generate_series($1::timestamp, $2::timestamp, interval '1 month') d
    ), billed AS (
      SELECT date_trunc('month', invoice_date)::date AS month, sum(total) AS amount
      FROM invoices WHERE status IN ('CONFIRMED', 'PAID') AND invoice_date BETWEEN $1::date AND $2::date
      GROUP BY 1
    ), receipts AS (
      SELECT method, amount, date FROM payments WHERE date BETWEEN $1::date AND $2::date
    ), collected AS (
      SELECT date_trunc('month', date)::date AS month, sum(amount) AS amount FROM receipts GROUP BY 1
    ), trend AS (
      SELECT m.month, coalesce(b.amount, 0) AS billed, coalesce(c.amount, 0) AS collected
      FROM month_list m LEFT JOIN billed b USING (month) LEFT JOIN collected c USING (month)
    ), open_invoices AS (
      SELECT i.id, i.number, u.name AS customer_name, i.due_date,
        i.total - i.amount_paid AS balance, greatest(0, $2::date - i.due_date) AS days_overdue
      FROM invoices i JOIN users u ON u.id = i.customer_id
      WHERE i.status = 'CONFIRMED' AND i.invoice_date <= $2::date AND i.total > i.amount_paid
    ), aging_buckets AS (
      SELECT * FROM (VALUES (0, 'Not due', 0, 0), (1, '1–30 days', 1, 30),
        (2, '31–60 days', 31, 60), (3, '61–90 days', 61, 90), (4, '90+ days', 91, 2147483647))
        AS b(position, label, min_days, max_days)
    ), aging AS (
      SELECT b.position, b.label, coalesce(sum(i.balance), 0) AS amount, count(i.id)::int AS count
      FROM aging_buckets b LEFT JOIN open_invoices i ON i.days_overdue BETWEEN b.min_days AND b.max_days
      GROUP BY b.position, b.label
    ), active_subscriptions AS (
      SELECT p.billing_period, p.price + coalesce((SELECT sum(l.quantity * l.unit_price)
        FROM subscription_lines l WHERE l.subscription_id = s.id), 0) AS recurring
      FROM subscriptions s JOIN plans p ON p.id = s.plan_id
      WHERE s.status = 'ACTIVE' AND s.start_date <= $2::date AND (s.expiry_date IS NULL OR s.expiry_date >= $2::date)
    ), methods AS (
      SELECT method, sum(amount) AS amount, count(*)::int AS count FROM receipts GROUP BY method
    )
    SELECT json_build_object(
      'period', json_build_object('months', $3::int, 'from', $1::date, 'to', $2::date),
      'as_of', $2::date,
      'summary', json_build_object(
        'billed', (SELECT coalesce(sum(billed), 0) FROM trend),
        'collected', (SELECT coalesce(sum(amount), 0) FROM receipts),
        'payment_count', (SELECT count(*)::int FROM receipts),
        'outstanding', (SELECT coalesce(sum(balance), 0) FROM open_invoices),
        'outstanding_count', (SELECT count(*)::int FROM open_invoices),
        'overdue', (SELECT coalesce(sum(balance), 0) FROM open_invoices WHERE days_overdue > 0),
        'overdue_count', (SELECT count(*)::int FROM open_invoices WHERE days_overdue > 0),
        'active_subscriptions', (SELECT count(*)::int FROM active_subscriptions),
        'estimated_mrr', (SELECT round(coalesce(sum(CASE billing_period
          WHEN 'DAILY' THEN recurring * 365 / 12 WHEN 'WEEKLY' THEN recurring * 52 / 12
          WHEN 'YEARLY' THEN recurring / 12 ELSE recurring END), 0), 2) FROM active_subscriptions)
      ),
      'trend', (SELECT json_agg(t ORDER BY t.month) FROM trend t),
      'aging', (SELECT json_agg(a ORDER BY a.position) FROM aging a),
      'payment_methods', coalesce((SELECT json_agg(m ORDER BY m.amount DESC, m.method) FROM methods m), '[]'::json),
      'overdue_invoices', coalesce((SELECT json_agg(o ORDER BY o.days_overdue DESC, o.id) FROM (
        SELECT * FROM open_invoices WHERE days_overdue > 0 ORDER BY days_overdue DESC, id LIMIT 8
      ) o), '[]'::json)
    ) AS dashboard
  `, [from, asOf, months]);
  return row.dashboard;
}
