// The list of pages.
//
// Every module has a file  src/pages/<module>/routes.jsx  that lists its own pages.
// This file collects them all automatically (import.meta.glob), so adding a module
// = just adding files. Nobody edits this file, so nobody gets git conflicts here.
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import Layout from './components/Layout';
import { Loading } from './components/ui';

const modules = import.meta.glob('./pages/*/routes.jsx', { eager: true });
const pages = Object.values(modules).flatMap((m) => m.default);

const exists = (path) => pages.some((p) => p.path === path);
// Customers land on their portal, the team on the dashboard (or a placeholder until that module is added)
const homeFor = (user) => {
  const target = user.role === 'CUSTOMER' ? '/portal' : '/dashboard';
  return exists(target) ? target : '/welcome';
};

// Shown for links whose module hasn't been added to the repo yet
function NotHereYet() {
  return (
    <div className="card empty" style={{ flexDirection: 'column' }}>
      <h3>This page isn't here yet</h3>
      <p>The module for it hasn't been added to the project yet.</p>
    </div>
  );
}

// Only lets the right people in; everyone else is sent to their home page
function Protected({ roles, children }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user)} replace />;
  return children;
}

function Home() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  return <Navigate to={user ? homeFor(user) : '/login'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      {pages.filter((p) => p.public).map((p) => <Route key={p.path} path={p.path} element={p.element} />)}
      <Route element={<Protected><Layout /></Protected>}>
        {pages.filter((p) => !p.public).map((p) => (
          <Route key={p.path} path={p.path} element={<Protected roles={p.roles}>{p.element}</Protected>} />
        ))}
        <Route path="/welcome" element={<NotHereYet />} />
        <Route path="*" element={<NotHereYet />} />
      </Route>
    </Routes>
  );
}
