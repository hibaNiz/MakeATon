import { Link } from 'react-router-dom';
import { Badge, Button, PageHeader, Pagination } from '../../components/ui';
import { useApi } from '../../lib/hooks';
import { date, money, title } from '../../lib/format';
import { useAuth } from '../../lib/auth';
import { Empty, Filters, LoadState, useListing } from './shared';

export default function Subscriptions() {
  const { user } = useAuth(), summary = useApi('/portal/summary');
  const state = useListing('/portal/subscriptions');
  const filtered = state.filters.search || state.filters.status;
  return <div className="portal catalog">
    <PageHeader title="My subscriptions" subtitle="Your plans, invoices and account, in one place." actions={<Button variant="secondary" onClick={() => { summary.reload(); state.reload(); }}>Refresh</Button>} />
    <section className="portal-welcome"><div><span className="portal-eyebrow">YOUR BRIGHTLOOP ACCOUNT</span><h2>Welcome, {user.name}.</h2><p>Keep track of what’s active and what’s next.</p></div><Link className="btn btn-secondary" to="/portal/invoices">View my invoices <span aria-hidden="true">↗</span></Link></section>
    <LoadState state={summary}>{summary.data && <dl className="portal-metrics">
      <div><dt>Active subscriptions</dt><dd>{summary.data.active}</dd><span>Currently running</span></div>
      <div><dt>Awaiting acceptance</dt><dd>{summary.data.quotations}</dd><span>Valid quotations</span></div>
      <div><dt>Outstanding balance</dt><dd>{money(summary.data.outstanding)}</dd><span>Across issued invoices</span></div>
      <div className={Number(summary.data.overdue) > 0 ? 'portal-overdue' : ''}><dt>Overdue balance</dt><dd>{money(summary.data.overdue)}</dd><span>As of {date(summary.data.as_of)}</span></div>
    </dl>}</LoadState>
    <Filters state={state} statuses={['QUOTATION', 'CONFIRMED', 'ACTIVE', 'PAUSED', 'CLOSED']} label="Number or plan name" />
    <LoadState state={state}>{state.data && <>
      {!state.data.items.length ? <Empty title={filtered ? 'No matching subscriptions' : 'Your subscriptions will appear here'}>{filtered ? 'Try another search or clear the filters.' : 'Once your team issues a quotation, you can review and accept it here.'}</Empty> : <div className="portal-subscriptions">
        {state.data.items.map(sub => <article className="portal-subscription" key={sub.id}>
          <div className="row wrap gap-sm"><span className="portal-plan-mark" aria-hidden="true">↻</span><span className="mono grow">{sub.number}</span><Badge status={sub.status} /></div>
          <h2>{sub.plan_name}</h2><p className="muted">{title(sub.billing_period)} subscription</p>
          <dl className="portal-card-facts"><div><dt>Starts</dt><dd>{date(sub.start_date)}</dd></div><div><dt>{sub.status === 'QUOTATION' ? 'Quotation valid until' : 'Expires'}</dt><dd>{date(sub.status === 'QUOTATION' ? sub.quotation_valid_until : sub.expiry_date)}</dd></div></dl>
          <Link className="portal-card-link" to={'/portal/subscriptions/' + sub.id} aria-label={`View subscription ${sub.number}`}>{sub.status === 'QUOTATION' ? 'Review quotation' : 'View subscription'}<span aria-hidden="true">→</span></Link>
        </article>)}
      </div>}
      <Pagination {...state.data} onPage={page => state.setFilters(old => ({ ...old, page }))} />
    </>}</LoadState>
  </div>;
}
