import { Router } from 'express';
import { allow } from '../../lib/auth.js';
import { asyncRoute, HttpError } from '../../lib/errors.js';
import { transaction } from '../../lib/db.js';
import { getRecord } from './catalog.service.js';
import { previewSchema } from './validation.js';
import { priceProduct } from './pricing.js';

export const mountPath = '/api/catalog';
const router = Router();
router.post('/price-preview', allow('ADMIN', 'STAFF'), asyncRoute(async (req, res) => {
  const data = previewSchema.parse(req.body);
  const result = await transaction(async db => {
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    const product = await getRecord('products', data.product_id, db);
    if (!product.active) throw new HttpError(400, 'Restore this product before previewing its price');
    const variant = data.variant_id ? product.variants.find(v => v.id === data.variant_id) : null;
    if (data.variant_id && !variant) throw new HttpError(400, 'Variant does not belong to this product', { variant_id: 'Choose a variant of this product' });
    const tax = product.tax_id ? await getRecord('taxes', product.tax_id, db) : null;
    const discount = data.discount_id ? await getRecord('discounts', data.discount_id, db) : null;
    const date = data.date || (await db.query('SELECT CURRENT_DATE AS date')).rows[0].date;
    return priceProduct({ product, variant, tax, discount, quantity: data.quantity, date });
  });
  res.json(result);
}));
export default router;
