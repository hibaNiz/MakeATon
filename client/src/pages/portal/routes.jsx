import Subscriptions from './Subscriptions';
import SubscriptionDetail from './SubscriptionDetail';
import Invoices from './Invoices';
import InvoiceDetail from './InvoiceDetail';
import Profile from './Profile';
import '../catalog/catalog.css';
import '../subscriptions/subscriptions.css';
import './portal.css';

export default [
  { path: '/portal', element: <Subscriptions /> },
  { path: '/portal/subscriptions/:id', element: <SubscriptionDetail /> },
  { path: '/portal/invoices', element: <Invoices /> },
  { path: '/portal/invoices/:id', element: <InvoiceDetail /> },
  { path: '/portal/profile', element: <Profile /> },
].map(route => ({ ...route, roles: ['CUSTOMER'] }));
