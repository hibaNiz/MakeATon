import { useState } from 'react';
import { Button, Card, PageHeader, useToast } from '../../components/ui';
import { api } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { useAuth } from '../../lib/auth';
import { Control, FormError } from '../catalog/Editor';
import { LoadState } from './shared';

function ProfileForm({ profile }) {
  const [data, setData] = useState({ name: profile.name, company: profile.company || '', phone: profile.phone || '', address: profile.address || '' });
  const [busy, setBusy] = useState(false), [error, setError] = useState(null), [saved, setSaved] = useState(false);
  const { setUser } = useAuth(), toast = useToast();
  const change = (name, value) => { setData(old => ({ ...old, [name]: value })); setSaved(false); };
  const control = (name, label, props) => <Control name={name} label={label} value={data[name]} onChange={value => change(name, value)} errors={error?.fields} {...props} />;
  async function save(event) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(null); setSaved(false);
    try { const user = await api('/portal/profile', { method: 'PUT', body: data }); setUser(user); setSaved(true); toast('Profile saved'); }
    catch (err) { setError(err); }
    finally { setBusy(false); }
  }
  return <form onSubmit={save} className="portal-profile-form stack" noValidate>
    <FormError error={error} />
    <fieldset className="catalog-fields stack" disabled={busy}>
      {control('name', 'Full name', { required: true, minLength: 2, maxLength: 100, autoComplete: 'name' })}
      <div className="grid grid-2">{control('company', 'Company', { maxLength: 120, autoComplete: 'organization' })}{control('phone', 'Phone', { type: 'tel', maxLength: 40, autoComplete: 'tel' })}</div>
      {control('address', 'Billing address', { type: 'textarea', maxLength: 2000, autoComplete: 'street-address' })}
    </fieldset>
    <div className="row gap wrap"><Button type="submit" loading={busy}>Save changes</Button>{saved && <span role="status">Your profile is up to date.</span>}</div>
  </form>;
}

export default function Profile() {
  const state = useApi('/portal/profile');
  return <div className="portal catalog"><PageHeader title="My profile" subtitle="Keep your contact and billing details up to date." />
    <LoadState state={state}>{state.data && <div className="portal-profile-grid">
      <Card title="Contact details"><ProfileForm profile={state.data} /></Card>
      <aside className="portal-account"><span className="portal-avatar" aria-hidden="true">{state.data.name.slice(0, 1).toUpperCase()}</span><h2>Your customer account</h2><p className="portal-email">{state.data.email}</p><p>Your email is used to sign in. Contact your team if it needs to change.</p><hr /><p>Need to reset your password? Use “Forgot password” on the sign-in page.</p></aside>
    </div>}</LoadState>
  </div>;
}
