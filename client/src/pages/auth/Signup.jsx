import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { isEmail, passwordProblems } from '../../lib/validation';
import { Button, ErrorBox, Field, Input } from '../../components/ui';
import AuthShell, { PasswordRules } from './AuthShell';

export default function Signup() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', company: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (form.name.trim().length < 2) errs.name = 'Enter your name';
    if (!isEmail(form.email)) errs.email = 'Enter a valid email address';
    const pw = passwordProblems(form.password);
    if (pw.length) errs.password = 'Password needs ' + pw.join(', ');
    if (form.confirm !== form.password) errs.confirm = "Passwords don't match";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError('');
    try {
      const { confirm, ...body } = form;
      signIn(await api('/auth/signup', { method: 'POST', body }));
      navigate('/portal');
    } catch (err) {
      setError(err.message);
      setErrors(err.fields);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <h1>Create your account</h1>
      <p className="muted">See and manage your subscriptions and invoices yourself.</p>
      <form onSubmit={submit} noValidate>
        <ErrorBox>{error}</ErrorBox>
        <Field label="Your name" error={errors.name}><Input value={form.name} onChange={set('name')} autoFocus /></Field>
        <Field label="Email" error={errors.email}><Input type="email" autoComplete="email" value={form.email} onChange={set('email')} /></Field>
        <Field label="Company (optional)"><Input value={form.company} onChange={set('company')} /></Field>
        <Field label="Password" error={errors.password}>
          <Input type="password" autoComplete="new-password" value={form.password} onChange={set('password')} />
          <PasswordRules value={form.password} />
        </Field>
        <Field label="Confirm password" error={errors.confirm}><Input type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} /></Field>
        <Button type="submit" className="btn-block" loading={busy}>Create account</Button>
        <p className="muted" style={{ textAlign: 'center', margin: 0 }}>Already have an account? <Link to="/login">Log in</Link></p>
      </form>
    </AuthShell>
  );
}
