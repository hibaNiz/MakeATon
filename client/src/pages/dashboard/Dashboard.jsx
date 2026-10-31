import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui';
import { useApi } from '../../lib/hooks';
import { date, money } from '../../lib/format';
import { AgingChart, CashflowChart, PaymentChart } from './Charts';

function Icon({ name }) {
  const paths = {
    cash: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3 10h18M7 15h3" /></>,
    invoice: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h6" /></>,
    repeat: <><path d="M20 7h-9a6 6 0 0 0-6 6M20 7l-4-4m4 4-4 4M4 17h9a6 6 0 0 0 6-6M4 17l4 4m-4-4 4-4" /></>,
    trend: <><path d="m4 17 6-6 4 3 6-9M14 5h6v6" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1" /></>,
  };
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}

function Metric({ label, value, detail, icon, featured, scope }) {
  return <article className={`finance-metric${featured ? ' featured' : ''}`}>
    <div className="finance-metric-top"><span>{label}</span><Icon name={icon} /></div>
    <strong className="finance-metric-value">{value}</strong>
    <p>{detail}</p><span className="finance-scope">{scope}</span>
  </article>;
}

function Panel({ title, subtitle, children, className = '', action }) {
  return <section className={`finance-panel ${className}`}>
    <header className="finance-panel-header"><div><h2>{title}</h2><p>{subtitle}</p></div>{action}</header>{children}
  </section>;
}

function Report({ data }) {
  const { summary, period } = data;
  return <>
    <div className="finance-report-meta"><span>Reporting period <strong>{date(period.from)} – {date(period.to)}</strong></span><span>Balances as of {date(data.as_of)} · UTC</span></div>
    <section className="finance-metrics" aria-label="Financial summary">
      <Metric label="Collected" value={money(summary.collected)} detail={`${summary.payment_count.toLocaleString('en-IN')} payments received`} icon="cash" featured scope="Selected period" />
      <Metric label="Outstanding" value={money(summary.outstanding)} detail={`${money(summary.overdue)} overdue`} icon="invoice" scope="Today’s balance" />
      <Metric label="Active subscriptions" value={summary.active_subscriptions.toLocaleString('en-IN')} detail="Started and within their active dates" icon="repeat" scope="Today" />
      <Metric label="Estimated MRR" value={money(summary.estimated_mrr)} detail="Recurring fees before discounts & tax" icon="trend" scope="Monthly equivalent · today" />
    </section>
    <Panel title="Billed & collected" subtitle="Follow your billing and cash collection, month by month." className="finance-trend-panel"
      action={<span className="finance-tag">INR · includes tax</span>}>
      <CashflowChart key={period.months} data={data.trend} />
      <p className="finance-note finance-chart-note">Billed uses invoice dates; collected uses payment dates, including payments for earlier invoices. Draft and cancelled invoices are excluded.</p>
    </Panel>
    <div className="finance-breakdowns">
      <Panel title="Payment mix" subtitle="How customers paid during the selected period." action={<Link to="/payments" className="finance-text-link">All payments <span aria-hidden="true">↗</span></Link>}>
        <PaymentChart data={data.payment_methods} total={summary.collected} count={summary.payment_count} />
      </Panel>
      <Panel title="Receivables aging" subtitle="What’s still owed today, across all periods." action={<span className="finance-tag">{summary.outstanding_count} open</span>}>
        <AgingChart data={data.aging} total={summary.outstanding} />
      </Panel>
    </div>
    <Panel title="Needs attention" subtitle={summary.overdue_count ? `${summary.overdue_count} overdue ${summary.overdue_count === 1 ? 'invoice' : 'invoices'} · ${money(summary.overdue)} to collect` : 'Your overdue invoices will appear here.'}
      action={<Link to="/invoices" className="finance-text-link">All invoices <span aria-hidden="true">↗</span></Link>} className="finance-overdue">
      {data.overdue_invoices.length ? <>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Overdue invoices">
          <table><caption className="sr-only">Oldest overdue invoices and remaining balances</caption><thead><tr><th scope="col">Invoice / customer</th><th scope="col">Due date</th><th scope="col">Overdue by</th><th scope="col" className="finance-amount">Balance</th></tr></thead>
            <tbody>{data.overdue_invoices.map(invoice => <tr key={invoice.id}>
              <th scope="row"><Link to={`/invoices/${invoice.id}`}>{invoice.number}</Link><span className="finance-customer">{invoice.customer_name}</span></th>
              <td>{date(invoice.due_date)}</td><td><span className="finance-overdue-pill">{invoice.days_overdue} {invoice.days_overdue === 1 ? 'day' : 'days'}</span></td><td className="finance-amount">{money(invoice.balance)}</td>
            </tr>)}</tbody></table>
        </div>
        <p className="finance-note finance-table-note">Showing the oldest {data.overdue_invoices.length} of {summary.overdue_count}. Open an invoice to review its balance or record a payment.</p>
      </> : <div className="finance-clear"><span className="finance-clear-icon" aria-hidden="true">✓</span><h3>No overdue invoices</h3><p>Confirmed invoices will appear here if a balance remains after the due date.</p></div>}
    </Panel>
    <details className="finance-definitions"><summary>How these numbers are calculated</summary>
      <p>Estimated monthly recurring revenue (MRR) adds the plan fee and saved product prices for active subscriptions. Monthly fees are unchanged; yearly fees are divided by 12, weekly fees multiplied by 52/12, and daily fees by 365/12. Discounts, taxes and partial final periods are excluded from this estimate.</p>
      <p>Outstanding and overdue balances include confirmed invoices dated through today, less their recorded payments. Subscriptions count as active only after their start date and through their expiry date. These are operational billing metrics; billed amounts are not accounting revenue.</p>
    </details>
  </>;
}

export default function Dashboard() {
  const [months, setMonths] = useState(6);
  const { data, loading, error, reload } = useApi(`/dashboard?months=${months}`);
  const ready = !loading && !error && data?.period.months === months;
  return <div className="finance-dashboard">
    <header className="finance-header"><div><span className="finance-eyebrow">Business overview</span><h1>Finance dashboard</h1><p>A clear view of your subscriptions, billing and cash flow.</p></div>
      <Button variant="secondary" loading={loading} onClick={reload}><Icon name="refresh" />Refresh</Button>
    </header>
    <div className="finance-toolbar"><span className="finance-toolbar-label">Reporting window</span><div className="finance-periods" role="group" aria-label="Reporting window">
      {[3, 6, 12].map(value => <button key={value} type="button" aria-pressed={value === months} onClick={() => setMonths(value)}>{value} months</button>)}
    </div><span className="finance-toolbar-note">Current month included</span></div>
    {error ? <div className="finance-state" role="alert"><h2>Couldn’t load your dashboard</h2><p>{error}</p><Button onClick={reload}>Try again</Button></div>
      : ready ? <Report data={data} /> : <div className="finance-loading" role="status" aria-label="Loading finance dashboard"><span className="spinner" /> Loading finance dashboard…<div className="finance-skeletons" aria-hidden="true">{[0, 1, 2, 3].map(i => <div key={i} />)}</div><div className="finance-skeleton-chart" aria-hidden="true" /></div>}
  </div>;
}
