import { z } from 'zod';

export const analyticsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(180).optional().default(30),
  companyId: z.string().uuid().optional(),
});
