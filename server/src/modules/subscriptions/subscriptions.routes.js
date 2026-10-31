import { Router } from 'express';
import { allow } from '../../lib/auth.js';
import { asyncRoute } from '../../lib/errors.js';
import { recordId, draftSchema, subscriptionFilters } from './validation.js';
import { getSubscription, listSubscriptions, saveDraft, deleteDraft } from './subscriptions.service.js';

export const mountPath = '/api/subscriptions';
const router = Router();
router.use(allow('ADMIN', 'STAFF'));
router.get('/', asyncRoute(async (req, res) => res.json(await listSubscriptions(subscriptionFilters.parse(req.query)))));
router.get('/:id', asyncRoute(async (req, res) => res.json(await getSubscription(recordId.parse(req.params.id)))));
router.post('/', asyncRoute(async (req, res) => res.status(201).json(await saveDraft(draftSchema.parse(req.body)))));
router.put('/:id', asyncRoute(async (req, res) => res.json(await saveDraft(draftSchema.parse(req.body), recordId.parse(req.params.id)))));
router.delete('/:id', asyncRoute(async (req, res) => {
  await deleteDraft(recordId.parse(req.params.id));
  res.status(204).end();
}));
export default router;
