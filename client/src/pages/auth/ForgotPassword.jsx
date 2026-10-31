import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { isEmail } from '../../lib/validation';
import { Button, ErrorBox, Field, Input } from '../../components/ui';
import AuthShell from './AuthShell';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!isEmail(email)) return setFieldError('Enter a valid email address');
    setFieldError('');
    setBusy(true);
    try {
      const res = await api('/auth/forgot-password', { method: 'POST', body: { email } });
      setDone(res.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <h1>Reset your password</h1>
      <p className="muted">We'll email a reset link to your registered address.</p>
      <form onSubmit={submit} noValidate>
        <ErrorBox>{error}</ErrorBox>
        {done ? (
          <div className="alert alert-info">{done}</div>
        ) : (
          <>
            <Field label="Email" error={fieldError}><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></Field>
            <Button type="submit" className="btn-block" loading={busy}>Send reset link</Button>
          </>
        )}
        <p className="muted" style={{ textAlign: 'center', margin: 0 }}><Link to="/login">← Back to log in</Link></p>
      </form>
    </AuthShell>
  );
}
