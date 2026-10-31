import { useEffect, useId, useRef } from 'react';
import { Button } from '../../components/ui';

export default function Dialog({ title, children, onClose, busy = false }) {
  const ref = useRef(null), heading = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog.showModal();
    return () => { dialog.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
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
  return <dialog ref={ref} className="catalog-dialog catalog" aria-labelledby={heading}
    onKeyDown={keepFocus}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className="catalog-dialog-head"><h2 id={heading}>{title}</h2>
      <Button type="button" variant="ghost" disabled={busy} onClick={onClose} aria-label="Close dialog">Close</Button>
    </header>
    <div className="catalog-dialog-body">{children}</div>
  </dialog>;
}
