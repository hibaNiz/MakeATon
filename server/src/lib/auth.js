// Login tokens (JWT) and role checks.
import jwt from 'jsonwebtoken';
import { createHmac } from 'node:crypto';
import { HttpError } from './errors.js';
import { query } from './db.js';

const SECRET = () => process.env.JWT_SECRET || 'dev-secret';
// Bind sessions to the current password hash without putting that hash in the token.
const passwordVersion = user => createHmac('sha256', SECRET()).update(user.password_hash).digest('hex');

export const signToken = (user) =>
  jwt.sign({ id: user.id, role: user.role, name: user.name, email: user.email, password_version: passwordVersion(user) }, SECRET(), { expiresIn: '8h' });

// Middleware: every request after this must carry "Authorization: Bearer <token>"
export function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new HttpError(401, 'Please log in'));
  let claims;
  try {
    claims = jwt.verify(token, SECRET());
    if (!Number.isSafeInteger(claims.id) || claims.id < 1) throw new Error('Invalid account ID');
  } catch {
    return next(new HttpError(401, 'Your session expired, please log in again'));
  }
  // Account removal, password resets and role changes affect existing sessions too.
  query('SELECT id, name, email, role, password_hash FROM users WHERE id = $1', [claims.id])
    .then(({ rows }) => {
      if (!rows.length) return next(new HttpError(401, 'Account not found'));
      if (claims.password_version !== passwordVersion(rows[0])) {
        return next(new HttpError(401, 'Your session expired, please log in again'));
      }
      const { password_hash, ...user } = rows[0];
      req.user = user;
      next();
    })
    .catch(next);
}

// Middleware: only let certain roles through.  Usage: allow('ADMIN', 'STAFF')
export const allow = (...roles) => (req, _res, next) =>
  roles.includes(req.user?.role) ? next() : next(new HttpError(403, 'You do not have access to this'));
