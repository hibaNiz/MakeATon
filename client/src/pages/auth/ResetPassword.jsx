import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { passwordProblems } from '../../lib/validation';
import { Button, ErrorBox, Field, Input, useToast } from '../../components/ui';
import AuthShell, { PasswordRules } from './AuthShell';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const token = params.get('token') || '';
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(token ? '' : 'This reset link is missing its token. Request a new one.');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    const pw = passwordProblems(form.password);
    if (pw.length) errs.password = 'Password needs ' + pw.join(', ');
    if (form.confirm !== form.password) errs.confirm = "Passwords don't match";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token, password: form.password } });
      toast('Password updated — log in with your new password');
      navigate('/login');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <h1>Choose a new password</h1>
      <form onSubmit={submit} noValidate>
        <ErrorBox>{error}</ErrorBox>
        <Field label="New password" error={errors.password}>
          <Input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoFocus />
          <PasswordRules value={form.password} />
        </Field>
        <Field label="Confirm password" error={errors.confirm}>
          <Input type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
        </Field>
        <Button type="submit" className="btn-block" loading={busy} disabled={!token}>Update password</Button>
        <p className="muted" style={{ textAlign: 'center', margin: 0 }}><Link to="/forgot-password">Request a new link</Link></p>
      </form>
    </AuthShell>
  );
}
