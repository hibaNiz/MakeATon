import Payments from './Payments';
import '../catalog/catalog.css';
import '../subscriptions/subscriptions.css';

export default [{ path: '/payments', element: <Payments />, roles: ['ADMIN', 'STAFF'] }];
