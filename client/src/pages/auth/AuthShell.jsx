// Two-column frame shared by login / signup / password pages.
export default function AuthShell({ children }) {
  return (
    <div className="auth">
      <aside className="auth-side">
        <div className="brand"><span className="brand-mark" /> Brightloop</div>
        <div>
          <h2>Plans, subscriptions and recurring billing — in one place.</h2>
          <ul>
            <li>Invoices created automatically on billing day</li>
            <li>Discounts and taxes applied without anyone remembering</li>
            <li>See what's paid, owed and overdue at a glance</li>
          </ul>
        </div>
        <small className="muted">Brightloop Software</small>
      </aside>
      <main className="auth-main"><div className="auth-card">{children}</div></main>
    </div>
  );
}

export function PasswordRules({ value }) {
  const rules = [
    ['More than 8 characters', value.length > 8],
    ['An uppercase letter', /[A-Z]/.test(value)],
    ['A lowercase letter', /[a-z]/.test(value)],
    ['A special character', /[^A-Za-z0-9]/.test(value)],
  ];
  return (
    <ul className="pw-rules">
      {rules.map(([label, ok]) => <li key={label} className={ok ? 'ok' : ''}>{ok ? '✓' : '○'} {label}</li>)}
    </ul>
  );
}
