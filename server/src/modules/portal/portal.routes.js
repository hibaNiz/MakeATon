import { Router } from 'express';
import { allow } from '../../lib/auth.js';
import { asyncRoute } from '../../lib/errors.js';
import { recordId, subscriptionFilters, invoiceFilters, actionSchema, profileSchema } from './validation.js';
import { getPortalSummary, listPortalSubscriptions, getPortalSubscription, actOnPortalSubscription,
  listPortalInvoices, getPortalInvoice, getPortalProfile, updatePortalProfile } from './portal.service.js';

export const mountPath = '/api/portal';
const router = Router();
router.use(allow('CUSTOMER'));
router.get('/summary', asyncRoute(async (req, res) => res.json(await getPortalSummary(req.user.id))));
router.get('/subscriptions', asyncRoute(async (req, res) => res.json(await listPortalSubscriptions(req.user.id, subscriptionFilters.parse(req.query)))));
router.get('/subscriptions/:id', asyncRoute(async (req, res) => res.json(await getPortalSubscription(req.user.id, recordId.parse(req.params.id)))));
router.post('/subscriptions/:id/actions', asyncRoute(async (req, res) => res.json(await actOnPortalSubscription(req.user.id, recordId.parse(req.params.id), actionSchema.parse(req.body)))));
router.get('/invoices', asyncRoute(async (req, res) => res.json(await listPortalInvoices(req.user.id, invoiceFilters.parse(req.query)))));
router.get('/invoices/:id', asyncRoute(async (req, res) => res.json(await getPortalInvoice(req.user.id, recordId.parse(req.params.id)))));
router.get('/profile', asyncRoute(async (req, res) => res.json(await getPortalProfile(req.user.id))));
router.put('/profile', asyncRoute(async (req, res) => res.json(await updatePortalProfile(req.user.id, profileSchema.parse(req.body)))));
export default router;
