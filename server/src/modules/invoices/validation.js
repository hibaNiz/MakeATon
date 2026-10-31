import { z } from 'zod';
import { recordId } from '../catalog/validation.js';
import { date } from '../subscriptions/validation.js';

export { recordId };
const pagination = {
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};
const range = data => data.from && data.to && data.from > data.to;
const rangeIssue = (data, ctx) => { if (range(data)) ctx.addIssue({ code: 'custom', path: ['to'], message: 'The end date must be on or after the start date' }); };

export const invoiceStatuses = ['DRAFT', 'CONFIRMED', 'PAID', 'CANCELLED'];
export const invoiceFilters = z.object({
  search: z.string().trim().max(120).default(''),
  status: z.enum(invoiceStatuses).optional(),
  overdue: z.enum(['true']).optional(),
  unpaid: z.enum(['true']).optional(),
  customer_id: recordId.optional(), subscription_id: recordId.optional(),
  from: date.optional(), to: date.optional(), ...pagination,
}).strict().superRefine(rangeIssue);

export const createInvoiceSchema = z.object({ subscription_id: recordId }).strict();
export const invoiceActionSchema = z.object({ action: z.enum(['confirm', 'cancel', 'send']) }).strict();
