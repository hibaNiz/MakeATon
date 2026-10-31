import { Link, useSearchParams } from 'react-router-dom';
import { Button, PageHeader, Pagination } from '../../components/ui';
import { Empty, Filters, InvoiceRows, LoadState, useListing } from './shared';

function InvoiceList({ subscriptionId }) {
  const state = useListing('/portal/invoices', { subscription_id: subscriptionId });
  const filtered = state.filters.search || state.filters.status || subscriptionId;
  return <div className="portal catalog">
    <PageHeader title="My invoices" subtitle="Issued invoices, balances and payment history." actions={<Button variant="secondary" onClick={state.reload}>Refresh</Button>} />
    {subscriptionId && <div className="portal-filter-notice"><span>Showing invoices for one subscription.</span><Link to="/portal/invoices">Show all invoices</Link></div>}
    <Filters state={state} statuses={['CONFIRMED', 'PAID', 'CANCELLED']} label="Invoice or subscription number" />
    <LoadState state={state}>{state.data && <>
      {!state.data.items.length ? <Empty title={filtered ? 'No matching invoices' : 'No invoices yet'}>{filtered ? 'Try another search or view all invoices.' : 'Your invoices will appear here once they have been issued.'}</Empty> : <section className="card"><InvoiceRows items={state.data.items} /></section>}
      <Pagination {...state.data} onPage={page => state.setFilters(old => ({ ...old, page }))} />
    </>}</LoadState>
    <p className="portal-footnote">Payments recorded by your team appear on each invoice. Contact your team to arrange payment or ask about a charge.</p>
  </div>;
}

export default function Invoices() {
  const [params] = useSearchParams();
  const id = params.get('subscription_id') || '';
  return <InvoiceList key={id} subscriptionId={id} />;
}
