import { z } from 'zod';

const numeric = z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number().finite());
export const recordId = numeric.pipe(z.number().int().positive().max(2147483647));
const amount = numeric.pipe(z.number().min(0).max(99999999.99))
  .refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 0.00001, 'Use at most two decimal places');
const name = z.string().trim().min(2, 'Enter at least two characters').max(120);
const optional = schema => z.preprocess(v => v === '' || v == null ? null : v, schema.nullable());
const quantity = numeric.pipe(z.number().int().min(1).max(10000));
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine(v => {
    const d = new Date(v + 'T00:00:00Z');
    return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 10) === v && v >= '1900-01-01';
  }, 'Enter a valid date from 1900 onward');
const availability = { start_date: optional(date), end_date: optional(date), active: z.boolean().default(true) };
function dateOrder(data, ctx) {
  if (data.start_date && data.end_date && data.start_date > data.end_date)
    ctx.addIssue({ code: 'custom', path: ['end_date'], message: 'End date must be on or after the start date' });
}
const variant = z.object({
  id: recordId.optional(), attribute: name, value: z.string().trim().min(1).max(120), extra_price: amount,
}).strict();

export const schemas = {
  taxes: z.object({ name, rate: amount.refine(v => v <= 100, 'Rate cannot exceed 100%'), active: z.boolean().default(true) }).strict(),
  products: z.object({
    name, type: z.enum(['SOFTWARE', 'SERVICE', 'ADDON', 'GOODS']), sales_price: amount, cost_price: amount,
    notes: optional(z.string().trim().max(2000)), tax_id: optional(recordId), active: z.boolean().default(true),
    variants: z.array(variant).max(100).default([]),
  }).strict().superRefine((data, ctx) => {
    const pairs = new Set(), ids = new Set();
    data.variants.forEach((v, i) => {
      const key = JSON.stringify([v.attribute.toLowerCase(), v.value.toLowerCase()]);
      if (pairs.has(key)) ctx.addIssue({ code: 'custom', path: ['variants', i, 'value'], message: 'This variant already exists' });
      if (v.id && ids.has(v.id)) ctx.addIssue({ code: 'custom', path: ['variants', i, 'id'], message: 'Duplicate variant ID' });
      pairs.add(key); if (v.id) ids.add(v.id);
    });
  }),
  plans: z.object({
    name, price: amount, billing_period: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']), min_quantity: quantity,
    ...availability, auto_close: z.boolean(), closable: z.boolean(), pausable: z.boolean(), renewable: z.boolean(),
  }).strict().superRefine(dateOrder),
  discounts: z.object({
    name, type: z.enum(['FIXED', 'PERCENTAGE']), value: amount.refine(v => v > 0, 'Enter a value greater than zero'),
    scope: z.enum(['PRODUCT', 'SUBSCRIPTION']), min_purchase: optional(amount), min_quantity: optional(quantity),
    ...availability, usage_limit: optional(numeric.pipe(z.number().int().min(1).max(2147483647))),
    product_ids: z.array(recordId).max(1000).default([]),
  }).strict().superRefine((data, ctx) => {
    dateOrder(data, ctx);
    const issue = (path, message) => ctx.addIssue({ code: 'custom', path: [path], message });
    if (data.type === 'PERCENTAGE' && data.value > 100) issue('value', 'Percentage cannot exceed 100%');
    if (new Set(data.product_ids).size !== data.product_ids.length) issue('product_ids', 'Select each product once');
    if (data.scope === 'PRODUCT' && !data.product_ids.length) issue('product_ids', 'Select at least one product');
    if (data.scope === 'SUBSCRIPTION' && data.product_ids.length) issue('product_ids', 'Subscription discounts cannot target individual products');
  }),
};

export const listSchema = z.object({
  search: z.string().trim().max(120).default(''), active: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export const previewSchema = z.object({
  product_id: recordId, variant_id: optional(recordId), quantity,
  discount_id: optional(recordId), date: date.optional(),
}).strict();
