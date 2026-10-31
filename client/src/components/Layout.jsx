// The frame around every logged-in page: sidebar menu (different per role) + content.
import { useState } from 'react';
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
  const location = useLocation();
  const menu = user.role === 'CUSTOMER' ? MENUS.customer : MENUS.internal;

  return (
    <div className="app">
      <div className="topbar">
        <button className="icon-btn" style={{ color: '#fff' }} onClick={() => setOpen(true)} aria-label="Open menu">☰</button>
        <strong>Brightloop</strong>
      </div>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <nav className={`sidebar ${open ? 'open' : ''}`} key={location.pathname} onClick={() => setOpen(false)}>
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
      <main className="content"><Outlet /></main>
    </div>
  );
}
