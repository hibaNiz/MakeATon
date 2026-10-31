import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { isEmail } from '../../lib/validation';
import { Button, ErrorBox, Field, Input } from '../../components/ui';
import AuthShell from './AuthShell';

const DEMO = [
  ['Admin', 'admin@brightloop.com', 'Admin@1234'],
  ['Staff', 'staff@brightloop.com', 'Staff@1234'],
  ['Customer', 'customer@brightloop.com', 'Customer@1234'],
];

export default function Login() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!isEmail(form.email)) errs.email = 'Enter a valid email address';
    if (!form.password) errs.password = 'Enter your password';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError('');
    try {
      const res = await api('/auth/login', { method: 'POST', body: form });
      signIn(res);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <h1>Welcome back</h1>
      <p className="muted">Log in to manage subscriptions and billing.</p>
      <form onSubmit={submit} noValidate>
        <ErrorBox>{error}</ErrorBox>
        <Field label="Email" error={errors.email}>
          <Input type="email" autoComplete="email" autoFocus value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Password" error={errors.password}>
          <Input type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: -6 }}>
          <Link to="/forgot-password">Forgot password?</Link>
        </div>
        <Button type="submit" className="btn-block" loading={busy}>Log in</Button>
        <p className="muted" style={{ textAlign: 'center', margin: 0 }}>New here? <Link to="/signup">Create an account</Link></p>
      </form>
      <div className="demo-logins muted">
        Demo logins:{' '}
        {DEMO.map(([label, email, password], i) => (
          <span key={label}>{i > 0 && ' · '}<button type="button" onClick={() => setForm({ email, password })}>{label}</button></span>
        ))}
      </div>
    </AuthShell>
  );
}
