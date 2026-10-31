import { z } from 'zod';
import { listSchema, recordId } from '../catalog/validation.js';
import { date, optional } from '../subscriptions/validation.js';

export { recordId };
const paging = listSchema.omit({ active: true });
export const subscriptionFilters = paging.extend({ status: z.enum(['QUOTATION', 'CONFIRMED', 'ACTIVE', 'PAUSED', 'CLOSED']).optional() }).strict();
export const invoiceFilters = paging.extend({
  status: z.enum(['CONFIRMED', 'PAID', 'CANCELLED']).optional(), subscription_id: recordId.optional(),
}).strict();
export const actionSchema = z.discriminatedUnion('action', [
  ...['accept', 'pause', 'resume', 'close'].map(action => z.object({ action: z.literal(action) }).strict()),
  z.object({ action: z.literal('renew'), expiry_date: date }).strict(),
]);
export const profileSchema = z.object({
  name: z.string().trim().min(2, 'Enter at least two characters').max(100),
  company: optional(z.string().trim().max(120)), phone: optional(z.string().trim().max(40)),
  address: optional(z.string().trim().max(2000)),
}).strict();
