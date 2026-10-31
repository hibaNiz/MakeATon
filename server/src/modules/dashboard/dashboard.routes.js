import { Router } from 'express';
import { allow } from '../../lib/auth.js';
import { asyncRoute } from '../../lib/errors.js';
import { getDashboard } from './dashboard.service.js';

export const mountPath = '/api/dashboard';
const router = Router();
router.use(allow('ADMIN', 'STAFF'));
router.get('/', asyncRoute(async (req, res) => res.json(await getDashboard(req.query))));
export default router;
