import { Router } from 'express';
import { allow } from '../../lib/auth.js';
import { asyncRoute } from '../../lib/errors.js';
import { runBilling } from './billing.service.js';

export const mountPath = '/api/billing';
const router = Router();
router.use(allow('ADMIN', 'STAFF'));
router.post('/run', asyncRoute(async (req, res) => res.json(await runBilling(req.body))));
export default router;
