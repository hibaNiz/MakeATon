import Invoices from './Invoices';
import InvoiceDetail from './InvoiceDetail';
import '../catalog/catalog.css';
import '../subscriptions/subscriptions.css';
import './billing.css';

export default [
  { path: '/invoices', element: <Invoices /> },
  { path: '/invoices/:id', element: <InvoiceDetail /> },
].map(route => ({ ...route, roles: ['ADMIN', 'STAFF'] }));
