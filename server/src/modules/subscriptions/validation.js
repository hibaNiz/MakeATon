import { z } from 'zod';
import { recordId, listSchema } from '../catalog/validation.js';

export { recordId };
export const optional = schema => z.preprocess(v => v === '' || v == null ? null : v, schema.nullable());
const integer = z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number().int());
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine(value => {
  const parsed = new Date(value + 'T00:00:00Z');
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value && value >= '1900-01-01';
}, 'Enter a valid date from 1900 onward');
export const notes = optional(z.string().trim().max(2000));
export const lines = z.array(z.object({
  product_id: recordId, variant_id: optional(recordId), quantity: integer.pipe(z.number().min(1).max(10000)),
}).strict()).min(1, 'Add at least one product').max(100).superRefine((items, ctx) => {
  const seen = new Set();
  items.forEach((line, index) => {
    const key = `${line.product_id}:${line.variant_id ?? ''}`;
    if (seen.has(key)) ctx.addIssue({ code: 'custom', path: [index, 'product_id'], message: 'Combine quantities for the same product and variant' });
    seen.add(key);
  });
});
export const templateSchema = z.object({
  name: z.string().trim().min(2).max(120), plan_id: recordId,
  validity_days: integer.pipe(z.number().min(1).max(365)).default(30), notes, lines,
}).strict();
export const templateFilters = listSchema.omit({ active: true }).strict();
