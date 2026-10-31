// MODULE 1 — pages this module adds. App.jsx finds this file automatically.
// public: true = no login needed.  roles: who may open it.
import Login from './Login';
import Signup from './Signup';
import ForgotPassword from './ForgotPassword';
import ResetPassword from './ResetPassword';
import People from './People';

export default [
  { path: '/login', element: <Login />, public: true },
  { path: '/signup', element: <Signup />, public: true },
  { path: '/forgot-password', element: <ForgotPassword />, public: true },
  { path: '/reset-password', element: <ResetPassword />, public: true },
  { path: '/customers', element: <People key="customers" role="CUSTOMER" />, roles: ['ADMIN', 'STAFF'] },
  { path: '/staff', element: <People key="staff" role="STAFF" />, roles: ['ADMIN'] },
];
