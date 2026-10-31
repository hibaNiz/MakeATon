// The frame around every logged-in page: sidebar menu (different per role) + content.
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { title } from '../lib/format';

const MENUS = {
  internal: [
    { group: 'Overview', items: [{ to: '/dashboard', label: 'Dashboard', icon: '◧' }] },
    { group: 'Sales', items: [
      { to: '/subscriptions', label: 'Subscriptions', icon: '↻' },
      { to: '/templates', label: 'Quotation templates', icon: '❐' },
      { to: '/customers', label: 'Customers', icon: '☺' },
    ] },
    { group: 'Billing', items: [
      { to: '/invoices', label: 'Invoices', icon: '▤' },
      { to: '/payments', label: 'Payments', icon: '₹' },
    ] },
    { group: 'Configuration', items: [
      { to: '/products', label: 'Products', icon: '▣' },
      { to: '/plans', label: 'Plans', icon: '☰' },
      { to: '/discounts', label: 'Discounts', icon: '%' },
      { to: '/taxes', label: 'Taxes', icon: '§' },
      { to: '/staff', label: 'Staff', icon: '◎', adminOnly: true },
    ] },
  ],
  customer: [
    { group: 'My account', items: [
      { to: '/portal', label: 'My subscriptions', icon: '↻', end: true },
      { to: '/portal/invoices', label: 'My invoices', icon: '▤' },
      { to: '/portal/profile', label: 'Profile', icon: '☺' },
    ] },
  ],
};

export default function Layout() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 860px)').matches);
  const sidebar = useRef(null);
  const location = useLocation();
  const menu = user.role === 'CUSTOMER' ? MENUS.customer : MENUS.internal;
  useEffect(() => {
    const media = window.matchMedia('(max-width: 860px)');
    const resize = () => { setMobile(media.matches); setOpen(false); };
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);
  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!mobile || !open) return;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sidebar.current.querySelector('button, a[href]')?.focus();
    return () => {
      document.body.style.overflow = overflow;
      if (previous?.isConnected && window.matchMedia('(max-width: 860px)').matches) previous.focus();
    };
  }, [mobile, open]);

  function menuKeyDown(event) {
    if (!mobile || !open) return;
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); return; }
    if (event.key !== 'Tab') return;
    const controls = [...sidebar.current.querySelectorAll('a[href], button')].filter(el => !el.disabled && el.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  return (
    <div className="app">
      <div className="topbar" inert={mobile && open ? '' : undefined}>
        <button className="icon-btn" style={{ color: '#fff' }} onClick={() => setOpen(true)} aria-label="Open menu" aria-controls="main-navigation" aria-expanded={open}>☰</button>
        <strong>Brightloop</strong>
      </div>
      {mobile && open && <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />}
      <nav ref={sidebar} id="main-navigation" aria-label="Main navigation" className={`sidebar ${open ? 'open' : ''}`}
        inert={mobile && !open ? '' : undefined} onKeyDown={menuKeyDown}
        onClick={event => { if (event.target.closest('a, button')) setOpen(false); }}>
        {mobile && <button className="menu-close btn btn-ghost" onClick={() => setOpen(false)}>Close menu</button>}
        <div className="brand"><span className="brand-mark" /> Brightloop</div>
        {menu.map((g) => (
          <div key={g.group}>
            <div className="nav-group">{g.group}</div>
            {g.items.filter((i) => !i.adminOnly || user.role === 'ADMIN').map((i) => (
              <NavLink key={i.to} to={i.to} end={i.end} className="nav-link">
                <span className="nav-icon">{i.icon}</span>{i.label}
              </NavLink>
            ))}
          </div>
        ))}
        <div className="sidebar-foot">
          <div className="who">{user.name}</div>
          <div className="muted" style={{ fontSize: 12 }}>{user.email}</div>
          <span className="role-pill">{title(user.role)}</span>
          <div><button className="btn btn-ghost btn-sm" style={{ color: '#cfd8d3', marginTop: 10, paddingLeft: 0 }} onClick={signOut}>Log out →</button></div>
        </div>
      </nav>
      <main className="content" inert={mobile && open ? '' : undefined}><Outlet /></main>
    </div>
  );
}
