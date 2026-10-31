import { useState } from 'react';
import { useApi, useDebounced } from '../../lib/hooks';
import { qs } from '../../lib/api';
import { Button } from '../../components/ui';
import { Control } from './Fields';

export default function CustomerPicker({ value, initialCustomer, onChange, errors }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(initialCustomer);
  const delayed = useDebounced(search);
  const state = useApi('/users' + qs({ role: 'CUSTOMER', search: delayed, pageSize: 20 }));
  const items = state.data?.items || [];
  const options = [...items];
  if (selected && !options.some(c => c.id === selected.id)) options.unshift(selected);
  function choose(id) {
    setSelected(options.find(c => String(c.id) === id));
    onChange(id);
  }
  return <div className="subscription-customer stack">
    <Control name="customer-search" label="Find a customer" type="search" maxLength={200} value={search} onChange={setSearch} placeholder="Name, email or company" hint="Search to narrow the first 20 matches." />
    <Control name="customer_id" label="Customer" value={value} onChange={choose} errors={errors} required disabled={state.loading || search !== delayed}
      options={[{ value: '', label: state.loading ? 'Loading customers…' : 'Choose a customer' }, ...options.map(c => ({ value: c.id, label: `${c.name} (${c.email})` }))]} />
    <span className="muted" role="status">{state.loading ? 'Searching customers…' : state.error ? '' : `${state.data?.total || 0} matching customers`}</span>
    {state.error && <div role="alert"><p className="alert alert-error">{state.error}</p><Button type="button" variant="secondary" onClick={state.reload}>Retry customer search</Button></div>}
  </div>;
}
