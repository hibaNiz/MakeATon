// MODULE 1 — Managing people: staff (admin only) and customers (admin + staff).
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../../lib/db.js';
import { asyncRoute, HttpError } from '../../lib/errors.js';
import { allow } from '../../lib/auth.js';
import { z, email, password, optionalText, paging } from '../../lib/validate.js';

export const mountPath = '/api/users';

const router = Router();
const cols = 'id, name, email, role, phone, company, address, created_at';

// GET /api/users?role=CUSTOMER&search=acme&page=1
router.get('/', allow('ADMIN', 'STAFF'), asyncRoute(async (req, res) => {
  const { page, pageSize, offset } = paging(req.query);
  const where = [];
  const params = [];
  if (req.query.role) { params.push(req.query.role); where.push(`role = $${params.length}`); }
  if (req.query.search) {
    params.push(`%${req.query.search}%`);
    where.push(`(name ILIKE $${params.length} OR email ILIKE $${params.length} OR company ILIKE $${params.length})`);
  }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const [list, count] = await Promise.all([
    query(`SELECT ${cols} FROM users ${w} ORDER BY name LIMIT ${pageSize} OFFSET ${offset}`, params),
    query(`SELECT count(*)::int AS n FROM users ${w}`, params),
  ]);
  res.json({ items: list.rows, total: count.rows[0].n, page, pageSize });
}));

const personSchema = z.object({
  name: z.string().trim().min(2, 'Enter a name').max(100),
  email,
  password,
  role: z.enum(['STAFF', 'CUSTOMER']),
  phone: optionalText,
  company: optionalText,
  address: optionalText,
});

// POST /api/users  — admin can add STAFF; admin and staff can add CUSTOMERS
router.post('/', allow('ADMIN', 'STAFF'), asyncRoute(async (req, res) => {
  const data = personSchema.parse(req.body);
  if (data.role === 'STAFF' && req.user.role !== 'ADMIN') {
    throw new HttpError(403, 'Only the admin can add staff members');
  }
  const exists = await query('SELECT 1 FROM users WHERE email = $1', [data.email]);
  if (exists.rows.length) throw new HttpError(409, 'Email already registered', { email: 'Email already registered' });
  const hash = await bcrypt.hash(data.password, 10);
  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash, role, phone, company, address)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${cols}`,
    [data.name, data.email, hash, data.role, data.phone, data.company, data.address]
  );
  res.status(201).json(rows[0]);
}));

// PUT /api/users/:id  — edit contact details (not password / role)
router.put('/:id', allow('ADMIN', 'STAFF'), asyncRoute(async (req, res) => {
  const data = personSchema.pick({ name: true, phone: true, company: true, address: true }).parse(req.body);
  const target = await query('SELECT role FROM users WHERE id = $1', [req.params.id]);
  if (!target.rows.length) throw new HttpError(404, 'User not found');
  if (target.rows[0].role !== 'CUSTOMER' && req.user.role !== 'ADMIN') throw new HttpError(403, 'Only the admin can edit staff');
  const { rows } = await query(
    `UPDATE users SET name=$1, phone=$2, company=$3, address=$4 WHERE id=$5 RETURNING ${cols}`,
    [data.name, data.phone, data.company, data.address, req.params.id]
  );
  res.json(rows[0]);
}));

// DELETE /api/users/:id  — admin only; blocked if they have subscriptions
router.delete('/:id', allow('ADMIN'), asyncRoute(async (req, res) => {
  if (Number(req.params.id) === req.user.id) throw new HttpError(400, "You can't delete your own account");
  await query('DELETE FROM users WHERE id = $1 AND role <> $2', [req.params.id, 'ADMIN']);
  res.status(204).end();
}));

export default router;
