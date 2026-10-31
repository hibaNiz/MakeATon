// A small error class so routes can say "throw new HttpError(404, 'Not found')"
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// Wraps an async route so thrown errors reach the error handler instead of crashing.
export const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Express error handler: turns any error into a clean JSON response.
export function errorHandler(err, req, res, _next) {
  // Zod validation errors -> 400 with a list of field problems
  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: 'Please fix the highlighted fields',
      fields: Object.fromEntries(err.errors.map((e) => [e.path.join('.') || 'form', e.message])),
    });
  }
  // Postgres unique violation (e.g. duplicate email)
  if (err.code === '23505') return res.status(409).json({ error: 'That record already exists' });
  // Postgres foreign key violation (e.g. deleting a product used by a subscription)
  if (err.code === '23503') return res.status(409).json({ error: 'This record is in use and cannot be removed' });
  if (err.status) return res.status(err.status).json({ error: err.message, fields: err.details });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
}
