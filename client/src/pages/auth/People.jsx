// Customers list (admin + staff) and Staff list (admin only) — same page, different role.
import { useState } from 'react';
import { api, qs } from '../../lib/api';
import { useApi, useDebounced } from '../../lib/hooks';
import { useAuth } from '../../lib/auth';
import { date } from '../../lib/format';
import { isEmail, passwordProblems } from '../../lib/validation';
import { Button, Card, Empty, ErrorBox, Field, Input, Loading, Modal, PageHeader, Pagination, Textarea, useToast } from '../../components/ui';
import { PasswordRules } from './AuthShell';

const blank = { name: '', email: '', password: '', phone: '', company: '', address: '' };

export default function People({ role }) {
  const { user } = useAuth();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const { data, loading, error, reload } = useApi(`/users${qs({ role, search: q, page })}`, []);
  const [editing, setEditing] = useState(null); // null | 'new' | user object
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const isStaff = role === 'STAFF';
  const noun = isStaff ? 'staff member' : 'customer';

  const open = (u) => {
    setEditing(u);
    setForm(u === 'new' ? blank : { ...blank, ...u, password: '' });
    setErrors({});
    setFormError('');
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    const errs = {};
    if (form.name.trim().length < 2) errs.name = 'Enter a name';
    if (editing === 'new') {
      if (!isEmail(form.email)) errs.email = 'Enter a valid email';
      const pw = passwordProblems(form.password);
      if (pw.length) errs.password = 'Needs ' + pw.join(', ');
    }
    if (form.phone && !/^[0-9+\-\s]{7,15}$/.test(form.phone)) errs.phone = 'Enter a valid phone number';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      if (editing === 'new') await api('/users', { method: 'POST', body: { ...form, role } });
      else await api(`/users/${editing.id}`, { method: 'PUT', body: form });
      toast(editing === 'new' ? `${isStaff ? 'Staff member' : 'Customer'} added` : 'Saved');
      setEditing(null);
      reload();
    } catch (err) {
      setFormError(err.message);
      setErrors(err.fields);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title={isStaff ? 'Staff' : 'Customers'}
        subtitle={isStaff ? 'Internal team members. Only the admin can add staff.' : 'Businesses that subscribe to Brightloop.'}
        actions={(!isStaff || user.role === 'ADMIN') && <Button onClick={() => open('new')}>+ Add {noun}</Button>}
      />
      <Card className="flush">
        <div className="toolbar" style={{ padding: '16px 16px 0' }}>
          <Input className="input search" placeholder="Search by name, email or company…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <ErrorBox>{error}</ErrorBox>
        {loading && !data ? <Loading /> : !data?.items.length ? <Empty>No {noun}s found.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Email</th><th>Company</th><th>Phone</th><th>Joined</th><th /></tr></thead>
              <tbody>
                {data.items.map((u) => (
                  <tr key={u.id}>
                    <td><strong>{u.name}</strong></td>
                    <td>{u.email}</td>
                    <td>{u.company || '—'}</td>
                    <td>{u.phone || '—'}</td>
                    <td>{date(u.created_at)}</td>
                    <td className="right"><Button size="sm" variant="ghost" onClick={() => open(u)}>Edit</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      </Card>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? `Add ${noun}` : `Edit ${noun}`}
        footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={save} loading={busy}>Save</Button></>}>
        <ErrorBox>{formError}</ErrorBox>
        <div className="grid grid-2">
          <Field label="Name" error={errors.name} className="span-2"><Input value={form.name} onChange={set('name')} /></Field>
          {editing === 'new' && (
            <>
              <Field label="Email" error={errors.email} className="span-2"><Input type="email" value={form.email} onChange={set('email')} /></Field>
              <Field label="Temporary password" error={errors.password} className="span-2">
                <Input type="password" value={form.password} onChange={set('password')} />
                <PasswordRules value={form.password} />
              </Field>
            </>
          )}
          <Field label="Phone" error={errors.phone}><Input value={form.phone || ''} onChange={set('phone')} /></Field>
          <Field label="Company"><Input value={form.company || ''} onChange={set('company')} /></Field>
          <Field label="Address" className="span-2"><Textarea value={form.address || ''} onChange={set('address')} /></Field>
        </div>
      </Modal>
    </>
  );
}
