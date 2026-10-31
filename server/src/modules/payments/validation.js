import { z } from 'zod';
import { recordId } from '../catalog/validation.js';
import { date, optional } from '../subscriptions/validation.js';

export { recordId };
const numeric = z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number().finite());
const pagination = {
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

export const paymentMethods = ['UPI', 'BANK_TRANSFER', 'CARD', 'CASH', 'CHEQUE'];
export const paymentSchema = z.object({
  invoice_id: recordId,
  method: z.enum(paymentMethods, { error: 'Choose a payment method' }),
  amount: numeric.pipe(z.number().positive('Enter an amount greater than zero').max(9999999999.99))
    .refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 0.00001, 'Use at most two decimal places'),
  date,
  note: optional(z.string().trim().max(500)),
}).strict();
export const paymentFilters = z.object({
  search: z.string().trim().max(120).default(''),
  method: z.enum(paymentMethods).optional(), invoice_id: recordId.optional(), customer_id: recordId.optional(),
  from: date.optional(), to: date.optional(), ...pagination,
}).strict().superRefine((data, ctx) => {
  if (data.from && data.to && data.from > data.to) ctx.addIssue({ code: 'custom', path: ['to'], message: 'The end date must be on or after the start date' });
});
