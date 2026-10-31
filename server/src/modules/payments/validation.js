import { z } from 'zod';
import { recordId } from '../catalog/validation.js';
import { date, optional } from '../subscriptions/validation.js';

export { recordId };
// Check decimal digits before coercion: sub-paisa amounts must not round into a payment.
const amount = z.union([z.number().finite(), z.string().trim()]).transform(String)
  .pipe(z.string().regex(/^\d+(?:\.\d{1,2})?$/, 'Enter an amount with at most two decimal places'))
  .pipe(z.coerce.number().positive('Enter an amount greater than zero').max(9999999999.99));
const pagination = {
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

export const paymentMethods = ['UPI', 'BANK_TRANSFER', 'CARD', 'CASH', 'CHEQUE'];
export const paymentSchema = z.object({
  invoice_id: recordId,
  method: z.enum(paymentMethods, { error: 'Choose a payment method' }),
  amount,
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
