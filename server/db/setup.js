// Creates (or re-creates) every table from schema.sql.  Run:  npm run db:setup
// ⚠️ This DELETES all existing data — use it to start fresh.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { pool } from '../src/lib/db.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const sql = fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8');

try {
  await pool.query(sql);
  // The first admin account, so someone can log in and add everything else
  await pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ('Asha Admin', 'admin@brightloop.com', $1, 'ADMIN')`,
    [bcrypt.hashSync('Admin@1234', 10)]
  );
  console.log('✅ Database tables created');
  console.log('   Admin login: admin@brightloop.com / Admin@1234  (change it after the demo!)');
} catch (err) {
  console.error('❌ Could not create tables:', err.message);
  console.error('   Check DATABASE_URL in server/.env and that PostgreSQL is running.');
  process.exitCode = 1;
} finally {
  await pool.end();
}
