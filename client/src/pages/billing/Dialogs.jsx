import { useState } from 'react';
import { Button } from '../../components/ui';
import { api } from '../../lib/api';
import { date, money, today } from '../../lib/format';
import Dialog from '../catalog/Dialog';
import { FormError } from '../subscriptions/Fields';

export function RunBillingDialog({ onClose, onSaved }) {
  const [confirm, setConfirm] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(null), [result, setResult] = useState(null);
  async function run() {
    if (busy) return;
    setBusy(true); setError(null);
    try { setResult(await api('/invoices/run-billing', { method: 'POST', body: { confirm } })); onSaved(); }
    catch (err) { setError(err); }
    setBusy(false);
  }
  return <Dialog title="Run billing" busy={busy} onClose={onClose}>
    <div className="stack">
      <FormError error={error} />
      {!result ? <>
        <p>Create invoices for every active subscription whose billing date is on or before {date(today())}. Missed periods are caught up, and a period is never invoiced twice. Billing also runs by itself every hour.</p>
        <label className="checkbox"><input type="checkbox" checked={confirm} disabled={busy} onChange={e => setConfirm(e.target.checked)} /><span>Confirm the invoices so they are ready for payment</span></label>
      </> : <>
        <div className="billing-result"><div><strong>{result.created}</strong>invoices created</div><div><strong>{result.skipped}</strong>already billed</div><div><strong>{result.errors}</strong>failed</div><div><strong>{result.closed}</strong>closed as expired</div></div>
        {result.errors > 0 && <p className="alert alert-error">Some subscriptions could not be billed. They will be tried again on the next run.</p>}
      </>}
      <div className="form-actions"><Button variant="secondary" disabled={busy} onClick={onClose}>{result ? 'Done' : 'Cancel'}</Button>{!result && <Button loading={busy} onClick={run}>Run billing</Button>}</div>
    </div>
  </Dialog>;
}

const COPY = {
  confirm: ['Confirm invoice', 'Confirm this invoice so payments can be recorded. Its amounts can no longer change.'],
  cancel: ['Cancel invoice', 'Cancel this invoice. It will not be billed again for the same period, and any discount use it consumed is given back.'],
  send: ['Send to customer', 'Email this invoice to the customer.'],
};
export function InvoiceActionDialog({ action, invoice, onClose, onSaved }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(null);
  async function go() {
    if (busy) return;
    setBusy(true); setError(null);
    try { onSaved(await api(`/invoices/${invoice.id}/actions`, { method: 'POST', body: { action } }), action); }
    catch (err) { setError(err); setBusy(false); }
  }
  return <Dialog title={COPY[action][0]} busy={busy} onClose={onClose}>
    <FormError error={error} />
    <p>{COPY[action][1]}</p>
    <p className="muted">{invoice.number} · {invoice.customer_name} · {money(invoice.total)}</p>
    <div className="form-actions"><Button variant="secondary" disabled={busy} onClick={onClose}>Back</Button><Button loading={busy} variant={action === 'cancel' ? 'danger' : 'primary'} onClick={go}>{COPY[action][0]}</Button></div>
  </Dialog>;
}
