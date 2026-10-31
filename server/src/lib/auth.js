// Login tokens (JWT) and role checks.
import jwt from 'jsonwebtoken';
import { HttpError } from './errors.js';

const SECRET = () => process.env.JWT_SECRET || 'dev-secret';

export const signToken = (user) =>
  jwt.sign({ id: user.id, role: user.role, name: user.name, email: user.email }, SECRET(), { expiresIn: '8h' });

// Middleware: every request after this must carry "Authorization: Bearer <token>"
export function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new HttpError(401, 'Please log in'));
  try {
    req.user = jwt.verify(token, SECRET());
    next();
  } catch {
    next(new HttpError(401, 'Your session expired, please log in again'));
  }
}

// Middleware: only let certain roles through.  Usage: allow('ADMIN', 'STAFF')
export const allow = (...roles) => (req, _res, next) =>
  roles.includes(req.user?.role) ? next() : next(new HttpError(403, 'You do not have access to this'));
