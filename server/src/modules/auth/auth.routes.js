// MODULE 1 — Sign up, log in, forgot/reset password, and who-am-I.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query } from '../../lib/db.js';
import { asyncRoute, HttpError } from '../../lib/errors.js';
import { signToken, requireAuth } from '../../lib/auth.js';
import { sendEmail } from '../../lib/email.js';
import { z, email, password, optionalText } from '../../lib/validate.js';

export const mountPath = '/api/auth';
export const isPublic = true; // no login needed

const router = Router();
const publicUser = ({ password_hash, reset_token_hash, reset_token_expiry, ...u }) => u;

// POST /api/auth/signup  — anyone can create a CUSTOMER account
router.post('/signup', asyncRoute(async (req, res) => {
  const data = z.object({
    name: z.string().trim().min(2, 'Enter your name').max(100),
    email,
    password,
    company: optionalText,
    phone: optionalText,
  }).parse(req.body);

  const existing = await query('SELECT id FROM users WHERE email = $1', [data.email]);
  if (existing.rows.length) throw new HttpError(409, 'An account with this email already exists', { email: 'Email already registered' });

  const hash = await bcrypt.hash(data.password, 10);
  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash, role, company, phone)
     VALUES ($1, $2, $3, 'CUSTOMER', $4, $5) RETURNING *`,
    [data.name, data.email, hash, data.company, data.phone]
  );
  res.status(201).json({ token: signToken(rows[0]), user: publicUser(rows[0]) });
}));

// POST /api/auth/login
router.post('/login', asyncRoute(async (req, res) => {
  const data = z.object({ email, password: z.string().min(1, 'Enter your password') }).parse(req.body);
  const { rows } = await query('SELECT * FROM users WHERE email = $1', [data.email]);
  const user = rows[0];
  // Same message for wrong email or wrong password, so nobody can probe which emails exist
  if (!user || !(await bcrypt.compare(data.password, user.password_hash))) {
    throw new HttpError(401, 'Wrong email or password');
  }
  res.json({ token: signToken(user), user: publicUser(user) });
}));

// POST /api/auth/forgot-password  — emails a reset link valid for 30 minutes
router.post('/forgot-password', asyncRoute(async (req, res) => {
  const { email: addr } = z.object({ email }).parse(req.body);
  const { rows } = await query('SELECT id, name FROM users WHERE email = $1', [addr]);
  if (rows.length) {
    const token = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    await query(
      `UPDATE users SET reset_token_hash = $1, reset_token_expiry = now() + interval '30 minutes' WHERE id = $2`,
      [hash, rows[0].id]
    );
    const link = `${process.env.CLIENT_URL || 'http://localhost:5173'}/reset-password?token=${token}`;
    await sendEmail({
      to: addr,
      subject: 'Reset your Brightloop password',
      text: `Hi ${rows[0].name},\n\nUse this link to set a new password (valid for 30 minutes):\n${link}\n\nIf you didn't ask for this, ignore this email.`,
    });
  }
  // Always the same reply, whether or not the email exists
  res.json({ message: 'If that email is registered, a reset link has been sent.' });
}));

// POST /api/auth/reset-password
router.post('/reset-password', asyncRoute(async (req, res) => {
  const data = z.object({ token: z.string().min(10), password }).parse(req.body);
  const hash = crypto.createHash('sha256').update(data.token).digest('hex');
  const { rows } = await query(
    'SELECT id FROM users WHERE reset_token_hash = $1 AND reset_token_expiry > now()',
    [hash]
  );
  if (!rows.length) throw new HttpError(400, 'This reset link is invalid or has expired');
  const newHash = await bcrypt.hash(data.password, 10);
  await query(
    'UPDATE users SET password_hash = $1, reset_token_hash = NULL, reset_token_expiry = NULL WHERE id = $2',
    [newHash, rows[0].id]
  );
  res.json({ message: 'Password updated. You can log in now.' });
}));

// GET /api/auth/me
router.get('/me', requireAuth, asyncRoute(async (req, res) => {
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  if (!rows.length) throw new HttpError(401, 'Account not found');
  res.json(publicUser(rows[0]));
}));

export default router;
