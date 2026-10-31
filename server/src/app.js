// Builds the Express app.
//
// Every file named "*.routes.js" inside src/modules is picked up automatically.
// Each one says where it lives with:   export const mountPath = '/api/something';
// and (only for login/signup)          export const isPublic = true;
// So adding a new module = just adding files. Nobody has to edit this file,
// which means teammates never get git conflicts here.
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { requireAuth } from './lib/auth.js';
import { errorHandler } from './lib/errors.js';

const modulesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'modules');

async function loadRouteFiles() {
  const found = [];
  for (const folder of fs.readdirSync(modulesDir)) {
    const dir = path.join(modulesDir, folder);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.routes.js'))) {
      const mod = await import(pathToFileURL(path.join(dir, file)).href);
      if (!mod.mountPath) throw new Error(`${folder}/${file} must export mountPath`);
      found.push({ name: `${folder}/${file}`, ...mod });
    }
  }
  return found;
}

export async function createApp() {
  const app = express();
  app.use(cors({ origin: process.env.CLIENT_URL || true }));
  app.use(express.json({ limit: '1mb' }));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  const routes = await loadRouteFiles();
  // 1) Public routes first (login, signup, password reset)
  for (const r of routes.filter((r) => r.isPublic)) app.use(r.mountPath, r.default);
  // 2) Everything else needs a valid login
  app.use('/api', requireAuth);
  for (const r of routes.filter((r) => !r.isPublic)) app.use(r.mountPath, r.default);
  console.log('📦 Modules loaded:', routes.map((r) => r.name).join(', '));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(errorHandler);
  return app;
}
