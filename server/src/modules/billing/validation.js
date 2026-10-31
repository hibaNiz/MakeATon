import { z } from 'zod';
import { recordId } from '../catalog/validation.js';

export const billingRunSchema = z.object({
  confirm: z.boolean().default(true),
  limit: z.number().int().min(1).max(500).default(100),
  subscription_id: recordId.optional(),
}).strict();
