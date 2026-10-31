import Dashboard from './Dashboard';
import './dashboard.css';

export default [{ path: '/dashboard', element: <Dashboard />, roles: ['ADMIN', 'STAFF'] }];
