import { useEffect, useState } from 'react';
import { api, qs } from '../../lib/api';

export function useCatalogData(path, version = 0) {
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  useEffect(() => {
    let current = true;
    setState({ loading: true, data: null, error: '' });
    api(path).then(data => { if (current) setState({ loading: false, data, error: '' }); })
      .catch(error => { if (current) setState({ loading: false, data: null, error: error.message }); });
    return () => { current = false; };
  }, [path, version]);
  return state;
}

export function useOptions(kind) {
  const [state, setState] = useState({ items: [], loading: Boolean(kind), error: '' });
  useEffect(() => {
    let current = true;
    if (!kind) { setState({ items: [], loading: false, error: '' }); return; }
    setState({ items: [], loading: true, error: '' });
    (async () => {
      const items = [];
      for (let page = 1; ; page++) {
        const result = await api('/' + kind + qs({ page, pageSize: 100 }));
        if (!current) return;
        items.push(...result.items);
        if (items.length >= result.total || !result.items.length) break;
      }
      setState({ items, loading: false, error: '' });
    })().catch(error => { if (current) setState({ items: [], loading: false, error: error.message }); });
    return () => { current = false; };
  }, [kind]);
  return state;
}

export const catalog = {
  products: { title: 'Products', singular: 'product', description: 'Set your prices, variants and default taxes.', fields: ['name', 'type', 'sales_price', 'cost_price', 'notes', 'tax_id', 'active', 'variants'], empty: { name: '', type: 'SOFTWARE', sales_price: '', cost_price: '', notes: '', tax_id: '', active: true, variants: [] } },
  plans: { title: 'Recurring plans', singular: 'plan', description: 'Define billing periods and subscription rules.', fields: ['name', 'price', 'billing_period', 'min_quantity', 'start_date', 'end_date', 'auto_close', 'closable', 'pausable', 'renewable', 'active'], empty: { name: '', price: '', billing_period: 'MONTHLY', min_quantity: 1, start_date: '', end_date: '', auto_close: false, closable: true, pausable: false, renewable: true, active: true } },
  taxes: { title: 'Taxes', singular: 'tax', description: 'Manage the rates applied to your products.', fields: ['name', 'rate', 'active'], empty: { name: '', rate: '', active: true } },
  discounts: { title: 'Discounts', singular: 'discount', description: 'Offer targeted savings with clear eligibility rules.', fields: ['name', 'type', 'value', 'scope', 'min_purchase', 'min_quantity', 'start_date', 'end_date', 'usage_limit', 'active', 'product_ids'], empty: { name: '', type: 'PERCENTAGE', value: '', scope: 'PRODUCT', min_purchase: '', min_quantity: '', start_date: '', end_date: '', usage_limit: '', active: true, product_ids: [] } },
};

export function formRecord(kind, record) {
  if (!record) return structuredClone(catalog[kind].empty);
  const data = Object.fromEntries(catalog[kind].fields.map(key => [key, record[key] ?? '']));
  if (kind === 'products') data.variants = record.variants.map(({ id, attribute, value, extra_price }) => ({ id, attribute, value, extra_price }));
  return data;
}
