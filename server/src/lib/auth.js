// Login tokens (JWT) and role checks.
import jwt from 'jsonwebtoken';
import { HttpError } from './errors.js';
import { query } from './db.js';

const SECRET = () => process.env.JWT_SECRET || 'dev-secret';

export const signToken = (user) =>
  jwt.sign({ id: user.id, role: user.role, name: user.name, email: user.email }, SECRET(), { expiresIn: '8h' });

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
  // Account removal and role changes take effect for existing sessions too.
  query('SELECT id, name, email, role FROM users WHERE id = $1', [claims.id])
    .then(({ rows }) => {
      if (!rows.length) return next(new HttpError(401, 'Account not found'));
      req.user = rows[0];
      next();
    })
    .catch(next);
}

// Middleware: only let certain roles through.  Usage: allow('ADMIN', 'STAFF')
export const allow = (...roles) => (req, _res, next) =>
  roles.includes(req.user?.role) ? next() : next(new HttpError(403, 'You do not have access to this'));
