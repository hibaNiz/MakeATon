// Shared validation helpers built on zod.
import { z } from 'zod';

// Password: MORE than eight characters, with uppercase, lowercase and a special character.
export const password = z
  .string()
  .min(9, 'Password must be more than 8 characters')
  .regex(/[A-Z]/, 'Password needs an uppercase letter')
  .regex(/[a-z]/, 'Password needs a lowercase letter')
  .regex(/[^A-Za-z0-9]/, 'Password needs a special character');

export const email = z.string().trim().toLowerCase().email('Enter a valid email address');
export const money = z.coerce.number({ error: 'Must be a number' }).min(0, 'Cannot be negative').max(99999999, 'Too large');
export const id = z.coerce.number().int().positive();
export const optionalId = z.preprocess((v) => (v === '' || v === null || v === undefined ? null : v), z.coerce.number().int().positive().nullable());
// 'YYYY-MM-DD' date, empty -> null
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date');
export const optionalDate = z.preprocess((v) => (v === '' || v === undefined ? null : v), date.nullable());
export const optionalText = z.preprocess((v) => (v === '' || v === undefined ? null : v), z.string().trim().max(2000).nullable());
export const optionalNumber = z.preprocess((v) => (v === '' || v === undefined || v === null ? null : v), z.coerce.number().min(0).nullable());
export const optionalInt = z.preprocess((v) => (v === '' || v === undefined || v === null ? null : v), z.coerce.number().int().min(1).nullable());

// Pagination from the query string: ?page=2&pageSize=25
export function paging(q) {
  const page = Math.max(1, parseInt(q.page) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export { z };
