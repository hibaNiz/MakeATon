import { Router } from 'express';
import { z } from 'zod';
import { allow } from '../../lib/auth.js';
import { asyncRoute } from '../../lib/errors.js';
import { schemas, recordId, listSchema } from './validation.js';
import { listRecords, getRecord, saveRecord, deleteRecord, setActive } from './catalog.service.js';

export function catalogRouter(kind) {
  const router = Router();
  const writers = kind === 'discounts' ? ['ADMIN'] : ['ADMIN', 'STAFF'];
  router.use(allow('ADMIN', 'STAFF'));
  router.get('/', asyncRoute(async (req, res) => res.json(await listRecords(kind, listSchema.parse(req.query)))));
  router.get('/:id', asyncRoute(async (req, res) => res.json(await getRecord(kind, recordId.parse(req.params.id)))));
  router.post('/', allow(...writers), asyncRoute(async (req, res) => res.status(201).json(await saveRecord(kind, schemas[kind].parse(req.body)))));
  router.put('/:id', allow(...writers), asyncRoute(async (req, res) => res.json(await saveRecord(kind, schemas[kind].parse(req.body), recordId.parse(req.params.id)))));
  router.patch('/:id', allow(...writers), asyncRoute(async (req, res) => {
    const { active } = z.object({ active: z.boolean() }).strict().parse(req.body);
    res.json(await setActive(kind, recordId.parse(req.params.id), active));
  }));
  router.delete('/:id', allow(...writers), asyncRoute(async (req, res) => {
    await deleteRecord(kind, recordId.parse(req.params.id));
    res.status(204).end();
  }));
  return router;
}
