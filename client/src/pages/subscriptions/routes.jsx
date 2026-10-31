import Templates from './Templates';
import '../catalog/catalog.css';
import './subscriptions.css';

export default [{ path: '/templates', element: <Templates />, roles: ['ADMIN', 'STAFF'] }];
