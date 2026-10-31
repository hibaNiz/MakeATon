import { z } from 'zod';

export const dashboardFilters = z.object({
  months: z.enum(['3', '6', '12']).default('6').transform(Number),
}).strict();
