import { useState } from 'react';
import { Button } from '../../components/ui';
import { api } from '../../lib/api';
import { addDays, date, today } from '../../lib/format';
import Dialog from '../catalog/Dialog';
import { Control, FormError } from './Fields';

const actions = {
  quote: { label: 'Issue quotation', description: 'Make this quotation available in the customer portal. The customer can accept it there, or you can record their acceptance here.' },
  confirm: { label: 'Confirm acceptance', description: 'Confirm that the customer has accepted this quotation. You can activate the subscription afterward.' },
  activate: { label: 'Activate subscription', description: 'Start this subscription with the saved product prices and agreed start date.' },
  pause: { label: 'Pause subscription', description: 'Pause this subscription until it is ready to resume.' },
  resume: { label: 'Resume subscription', description: 'Return this paused subscription to active status.' },
  close: { label: 'Close subscription', description: 'Close this subscription permanently. A closed subscription cannot be reopened.' },
  revise: { label: 'Revise quotation', description: 'Return this quotation to a draft and clear its validity date. Saving the revised draft will refresh product prices from the catalog.' },
  renew: { label: 'Renew subscription', description: 'Extend the expiry date. A paused subscription stays paused until you resume it.' },
  delete: { label: 'Delete draft', description: 'Permanently delete this draft and its product lines.' },
};

export function availableActions(record) {
  const expired = record.expiry_date && record.expiry_date < today();
  const quotationExpired = !record.quotation_valid_until || record.quotation_valid_until < today();
  switch (record.status) {
    case 'DRAFT': return [...(!expired ? ['quote'] : []), 'delete'];
    case 'QUOTATION': return [...(!expired && !quotationExpired ? ['confirm'] : []), 'revise', 'close'];
    case 'CONFIRMED': return [...(!expired ? ['activate'] : []), 'close'];
    case 'ACTIVE':
    case 'PAUSED': return [
      ...(!expired && record.status === 'PAUSED' ? ['resume'] : !expired && record.pausable ? ['pause'] : []),
      ...(record.renewable && record.expiry_date ? ['renew'] : []),
      ...(record.closable || expired ? ['close'] : []),
    ];
    default: return [];
  }
}

export function subscriptionNotice(record) {
  const expired = record.expiry_date && record.expiry_date < today();
  if (expired) {
    if (record.status === 'DRAFT') return 'The subscription expiry has passed. Edit the draft dates before issuing a quotation.';
    if (record.status === 'QUOTATION') return 'The subscription expiry has passed. Revise the quotation to update its dates, or close it.';
    if (record.status === 'CONFIRMED') return 'The subscription expiry has passed. Close this subscription and prepare a new draft if the customer wants to continue.';
    if (['ACTIVE', 'PAUSED'].includes(record.status)) return record.renewable
      ? 'The subscription expiry has passed. Renew it to continue, or close it.'
      : 'The subscription expiry has passed. This plan does not allow renewal; close the subscription.';
  }
  if (record.status === 'QUOTATION' && (!record.quotation_valid_until || record.quotation_valid_until < today()))
    return 'The quotation is no longer valid. Revise it before recording customer acceptance, or close it.';
  return null;
}

export function ActionButtons({ record, onAction }) {
  return <div className="row gap-sm wrap">
    {availableActions(record).map(action => <Button key={action} variant={['quote', 'confirm', 'activate', 'resume'].includes(action) ? 'primary' : 'secondary'} onClick={() => onAction(action)}>{actions[action].label}</Button>)}
  </div>;
}

export function ActionDialog({ action, record, onClose, onSaved, onReload }) {
  const info = actions[action];
  const [busy, setBusy] = useState(false), [error, setError] = useState(null);
  const [value, setValue] = useState(() => action === 'renew'
    ? addDays(record.expiry_date > today() ? record.expiry_date : today(), 30)
    : record.quotation_valid_until || [addDays(today(), 30), record.expiry_date].filter(Boolean).sort()[0]);
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const body = { action, ...(action === 'quote' ? { quotation_valid_until: value } : action === 'renew' ? { expiry_date: value } : {}) };
      const result = await api('/subscriptions/' + record.id + (action === 'delete' ? '' : '/actions'), { method: action === 'delete' ? 'DELETE' : 'POST', body: action === 'delete' ? undefined : body });
      onSaved(result, action === 'delete' ? 'Draft deleted' : action === 'renew' ? 'Subscription renewed' : 'Subscription updated');
    } catch (err) { setError(err); setBusy(false); }
  }
  return <Dialog title={info.label} busy={busy} onClose={onClose}>
    <form className="stack" onSubmit={submit} noValidate>
      <FormError error={error} />
      <p>{info.description}</p>
      <p className="muted">{record.number} · {record.customer_name}</p>
      <fieldset className="catalog-fields" disabled={busy}>
        {action === 'quote' && <Control name="quotation_valid_until" label="Quotation valid until" type="date" required min={today()} max={record.expiry_date || undefined} value={value} onChange={setValue} errors={error?.fields} />}
        {action === 'renew' && <Control name="expiry_date" label="New expiry date" type="date" required min={addDays(record.expiry_date > today() ? record.expiry_date : today(), 1)} value={value} onChange={setValue} errors={error?.fields} hint={`Current expiry: ${date(record.expiry_date)}`} />}
      </fieldset>
      {error && <Button type="button" variant="ghost" onClick={onReload}>Reload subscription</Button>}
      <div className="form-actions"><Button type="button" variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button><Button loading={busy} variant={['delete', 'close'].includes(action) ? 'danger' : 'primary'}>{info.label}</Button></div>
    </form>
  </Dialog>;
}

export function CloseExpiredDialog({ onClose, onSaved }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(null);
  async function closeExpired() {
    if (busy) return;
    setBusy(true); setError(null);
    try { const result = await api('/subscriptions/close-expired', { method: 'POST' }); onSaved(`${result.closed} expired subscriptions closed`); }
    catch (err) { setError(err); setBusy(false); }
  }
  return <Dialog title="Close expired subscriptions" busy={busy} onClose={onClose}>
    <FormError error={error} />
    <p>Close expired subscriptions whose plan has auto-close enabled. Expiry must be before {date(today())}. Active subscriptions with unbilled periods stay open until billing catches up.</p>
    <p className="muted">This applies across all customers, regardless of your list filters. Closing is permanent.</p>
    <div className="form-actions"><Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button><Button variant="danger" loading={busy} onClick={closeExpired}>Close expired subscriptions</Button></div>
  </Dialog>;
}
