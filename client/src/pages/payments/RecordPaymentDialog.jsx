import { useState } from 'react';
import { Button } from '../../components/ui';
import { api } from '../../lib/api';
import { money, today } from '../../lib/format';
import Dialog from '../catalog/Dialog';
import { Control, FormError } from '../subscriptions/Fields';

export const METHODS = [
  { value: 'UPI', label: 'UPI' }, { value: 'BANK_TRANSFER', label: 'Bank transfer' }, { value: 'CARD', label: 'Card' },
  { value: 'CASH', label: 'Cash' }, { value: 'CHEQUE', label: 'Cheque' },
];

export function RecordPaymentDialog({ invoice, onClose, onSaved }) {
  const [form, setForm] = useState({ method: 'UPI', amount: String(invoice.balance), date: today(), note: '' });
  const [busy, setBusy] = useState(false), [error, setError] = useState(null);
  const set = key => value => setForm(f => ({ ...f, [key]: value }));
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try {
      await api('/payments', { method: 'POST', body: { invoice_id: invoice.id, method: form.method, amount: form.amount, date: form.date, note: form.note || undefined } });
      onSaved('Payment recorded');
    } catch (err) { setError(err); setBusy(false); }
  }
  return <Dialog title="Record payment" busy={busy} onClose={onClose}>
    <form className="stack" onSubmit={submit} noValidate>
      <FormError error={error} />
      <p className="muted">{invoice.number} · {invoice.customer_name} · Balance due {money(invoice.balance)}</p>
      <fieldset className="catalog-fields" disabled={busy}>
        <Control name="amount" label="Amount (INR)" type="number" inputMode="decimal" min="0.01" step="0.01" max={invoice.balance} required value={form.amount} onChange={set('amount')} errors={error?.fields} autoFocus />
        <Control name="method" label="Payment method" value={form.method} onChange={set('method')} options={METHODS} errors={error?.fields} />
        <Control name="date" label="Payment date" type="date" required min={invoice.invoice_date} max={today()} value={form.date} onChange={set('date')} errors={error?.fields} />
        <Control name="note" label="Reference or note (optional)" type="textarea" maxLength={500} value={form.note} onChange={set('note')} errors={error?.fields} />
      </fieldset>
      <div className="form-actions"><Button type="button" variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button><Button loading={busy}>Record payment</Button></div>
    </form>
  </Dialog>;
}
