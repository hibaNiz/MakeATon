import { Router } from 'express';
import { allow } from '../../lib/auth.js';
import { asyncRoute } from '../../lib/errors.js';
import { recordId, invoiceFilters, createInvoiceSchema, invoiceActionSchema } from './validation.js';
import { billNextPeriod } from '../billing/billing.service.js';
import { getInvoice, listInvoices, applyInvoiceAction, confirmAllDrafts } from './invoices.service.js';

export const mountPath = '/api/invoices';
const router = Router();
router.use(allow('ADMIN', 'STAFF'));
router.get('/', asyncRoute(async (req, res) => res.json(await listInvoices(invoiceFilters.parse(req.query)))));
router.post('/confirm-drafts', asyncRoute(async (_req, res) => res.json(await confirmAllDrafts())));
router.get('/:id', asyncRoute(async (req, res) => res.json(await getInvoice(recordId.parse(req.params.id)))));
router.post('/', asyncRoute(async (req, res) => {
  const { subscription_id } = createInvoiceSchema.parse(req.body);
  const invoice = await billNextPeriod(subscription_id);
  res.status(201).json(await getInvoice(invoice.id));
}));
router.post('/:id/actions', asyncRoute(async (req, res) => res.json(await applyInvoiceAction(recordId.parse(req.params.id), invoiceActionSchema.parse(req.body).action))));
export default router;
