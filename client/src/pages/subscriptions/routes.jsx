import Templates from './Templates';
import Subscriptions from './Subscriptions';
import DraftEditor from './DraftEditor';
import SubscriptionDetail from './SubscriptionDetail';
import '../catalog/catalog.css';
import './subscriptions.css';

export default [
  { path: '/templates', element: <Templates /> },
  { path: '/subscriptions', element: <Subscriptions /> },
  { path: '/subscriptions/new', element: <DraftEditor /> },
  { path: '/subscriptions/:id/edit', element: <DraftEditor /> },
  { path: '/subscriptions/:id', element: <SubscriptionDetail /> },
].map(route => ({ ...route, roles: ['ADMIN', 'STAFF'] }));
