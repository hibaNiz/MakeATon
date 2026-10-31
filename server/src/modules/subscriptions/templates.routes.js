import { Router } from 'express';
import { allow } from '../../lib/auth.js';
import { asyncRoute } from '../../lib/errors.js';
import { recordId, templateSchema, templateFilters } from './validation.js';
import { listTemplates, getTemplate, saveTemplate, deleteTemplate } from './templates.service.js';

export const mountPath = '/api/templates';
const router = Router();
router.use(allow('ADMIN', 'STAFF'));
router.get('/', asyncRoute(async (req, res) => res.json(await listTemplates(templateFilters.parse(req.query)))));
router.get('/:id', asyncRoute(async (req, res) => res.json(await getTemplate(recordId.parse(req.params.id)))));
router.post('/', asyncRoute(async (req, res) => res.status(201).json(await saveTemplate(templateSchema.parse(req.body)))));
router.put('/:id', asyncRoute(async (req, res) => res.json(await saveTemplate(templateSchema.parse(req.body), recordId.parse(req.params.id)))));
router.delete('/:id', asyncRoute(async (req, res) => {
  await deleteTemplate(recordId.parse(req.params.id));
  res.status(204).end();
}));
export default router;
