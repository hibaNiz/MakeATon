import CatalogPage from './CatalogPage';
import './catalog.css';

export default ['products', 'plans', 'taxes', 'discounts'].map(kind => ({
  path: '/' + kind, element: <CatalogPage key={kind} kind={kind} />, roles: ['ADMIN', 'STAFF'],
}));
