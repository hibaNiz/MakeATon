import { Router } from 'express';
import { allow } from '../../lib/auth.js';
import { asyncRoute } from '../../lib/errors.js';
import { recordId, paymentSchema, paymentFilters } from './validation.js';
import { listPayments, recordPayment, deletePayment } from './payments.service.js';

export const mountPath = '/api/payments';
const router = Router();
router.use(allow('ADMIN', 'STAFF'));
router.get('/', asyncRoute(async (req, res) => res.json(await listPayments(paymentFilters.parse(req.query)))));
router.post('/', asyncRoute(async (req, res) => res.status(201).json(await recordPayment(paymentSchema.parse(req.body), req.user.id))));
router.delete('/:id', allow('ADMIN'), asyncRoute(async (req, res) => {
  await deletePayment(recordId.parse(req.params.id));
  res.status(204).end();
}));
export default router;
