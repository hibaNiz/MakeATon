// Small reusable building blocks, so every page looks and behaves the same.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { title } from '../lib/format';

export function Button({ variant = 'primary', size, loading, children, className = '', ...props }) {
  return (
    <button className={`btn btn-${variant} ${size === 'sm' ? 'btn-sm' : ''} ${className}`} {...props} disabled={loading || props.disabled}>
      {loading && <span className="spinner" />}
      {children}
    </button>
  );
}

// A labelled form field that shows its error message underneath
export function Field({ label, error, hint, children, className = '' }) {
  return (
    <label className={`field ${error ? 'has-error' : ''} ${className}`}>
      {label && <span className="field-label">{label}</span>}
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export const Input = (props) => <input className="input" {...props} />;
export const Textarea = (props) => <textarea className="input" rows={3} {...props} />;
export function Select({ options, placeholder, ...props }) {
  return (
    <select className="input" {...props}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
export function Checkbox({ label, ...props }) {
  return (
    <label className="checkbox">
      <input type="checkbox" {...props} />
      <span>{label}</span>
    </label>
  );
}

const STATUS_TONE = {
  DRAFT: 'grey', QUOTATION: 'blue', CONFIRMED: 'violet', ACTIVE: 'green', PAUSED: 'amber', CLOSED: 'grey',
  PAID: 'green', CANCELLED: 'red', OVERDUE: 'red', PARTIAL: 'amber',
};
export function Badge({ status, children }) {
  return <span className={`badge badge-${STATUS_TONE[status] || 'grey'}`}>{children || title(status)}</span>;
}

export function Card({ title: heading, actions, children, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(heading || actions) && (
        <header className="card-head">
          {heading && <h3>{heading}</h3>}
          {actions && <div className="row gap-sm">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title: heading, subtitle, actions }) {
  return (
    <div className="page-header">
      <div>
        <h1>{heading}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="row gap-sm wrap">{actions}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title: heading, children, footer, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const dialog = ref.current;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);
  function keepFocus(event) {
    if (event.key !== 'Tab') return;
    const controls = [...ref.current.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')]
      .filter(el => el.tabIndex >= 0 && !el.matches(':disabled') && el.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (!first) { event.preventDefault(); ref.current.focus(); return; }
    if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement))) {
      event.preventDefault(); first.focus();
    }
  }
  if (!open) return null;
  return (
    <dialog ref={ref} className="modal-backdrop" aria-label={heading} onKeyDown={keepFocus}
      onCancel={event => { event.preventDefault(); onClose(); }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`}>
        <header className="modal-head">
          <h3>{heading}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </dialog>
  );
}

export function Pagination({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="pagination">
      <span className="muted">{from}–{to} of {total.toLocaleString('en-IN')}</span>
      <div className="row gap-sm">
        <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹ Prev</Button>
        <span className="muted">Page {page} / {pages}</span>
        <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next ›</Button>
      </div>
    </div>
  );
}

export const Empty = ({ children = 'Nothing here yet.' }) => <div className="empty">{children}</div>;
export const Loading = () => <div className="empty"><span className="spinner dark" /> Loading…</div>;
export const ErrorBox = ({ children }) => (children ? <div className="alert alert-error">{children}</div> : null);

// Toast messages ("Saved!", "Something went wrong")
const ToastContext = createContext(() => {});
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, tone = 'success') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast toast-${t.tone}`}>{t.message}</div>)}
      </div>
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);

// Shows where a subscription is in its life-cycle
const STEPS = ['DRAFT', 'QUOTATION', 'CONFIRMED', 'ACTIVE', 'CLOSED'];
export function StatusSteps({ status }) {
  const current = status === 'PAUSED' ? STEPS.indexOf('ACTIVE') : STEPS.indexOf(status);
  return (
    <ol className="steps">
      {STEPS.map((s, i) => (
        <li key={s} className={i < current ? 'done' : i === current ? 'current' : ''}>
          <span className="dot">{i < current ? '✓' : i + 1}</span>
          <span>{s === 'ACTIVE' && status === 'PAUSED' ? 'Paused' : title(s)}</span>
        </li>
      ))}
    </ol>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} className={value === t.value ? 'active' : ''} onClick={() => onChange(t.value)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
