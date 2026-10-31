import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { pool, transaction } from '../src/lib/db.js';

// Additive upgrades for existing databases; db:setup is only for a fresh/reset database.
export async function migrate() {
  const directory = new URL('./migrations/', import.meta.url);
  const files = (await readdir(directory)).filter(name => name.endsWith('.sql')).sort();
  return transaction(async client => {
    // Serialize startup across API processes, including the initial tracking table.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('brightloop.schema'))");
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map(row => row.name)), changed = [];
    for (const file of files) {
      if (applied.has(file)) continue;
      await client.query(await readFile(new URL(file, directory), 'utf8'));
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      changed.push(file);
    }
    return changed;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log('Database migrations:', await migrate()); }
  catch (error) { console.error('Database migration failed:', error.message); process.exitCode = 1; }
  finally { await pool.end(); }
}
