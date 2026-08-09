import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry, SuccessEnvelopeSchema } from '../../core/openapi/registry';

extendZodWithOpenApi(z);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date (YYYY-MM-DD)');

export const dateParamsSchema = z.object({ date: isoDate });
export const idParamsSchema = z.object({ id: z.string().uuid() });
export const lockDaySchema = z.object({ date: isoDate });
export const listPlansQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
});
export const planStatusSchema = z.object({
  status: z.enum(['locked', 'in_production', 'completed', 'cancelled']),
});

export const productionLineSchema = z
  .object({
    productId: z.string().uuid(),
    productName: z.string(),
    componentType: z.string().nullable(),
    confirmedQty: z.number().int(),
    unconfirmedQty: z.number().int(),
    producedQty: z.number().int(),
    plannedQty: z.number().int(),
    orderCount: z.number().int(),
    companyCount: z.number().int(),
    prepTimeMins: z.number().int().nullable(),
    lineSubtotal: z.string(),
    lineCost: z.string().nullable(),
  })
  .openapi('ProductionLine');

export const productionDaySchema = z
  .object({
    date: z.string(),
    orderCount: z.number().int(),
    companyCount: z.number().int(),
    totalPortions: z.number().int(),
    estimatedPrepMinutes: z.number().int(),
    currency: z.string(),
    currencyMismatch: z.boolean(),
    subtotal: z.string(),
    cost: z.string().nullable(),
    costedPortions: z.number().int(),
    uncostedPortions: z.number().int(),
    costCoveragePercent: z.string(),
    lines: z.array(productionLineSchema),
  })
  .openapi('ProductionDay');

const dash = [{ dashboardBearerAuth: [] }];
const TAG = ['Production'];

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/production/day/{date}',
  tags: TAG,
  summary: 'What the kitchen must make on a day, across every client',
  security: dash,
  request: { params: dateParamsSchema },
  responses: {
    200: {
      description: 'Consolidated prep list',
      content: { 'application/json': { schema: SuccessEnvelopeSchema(productionDaySchema) } },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/production/day/{date}/by-company',
  tags: TAG,
  summary: 'The same day split per client, for packing',
  security: dash,
  request: { params: dateParamsSchema },
  responses: { 200: { description: 'Per company breakdown' } },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/production/plans',
  tags: TAG,
  summary: 'Lock a day into a snapshot the kitchen cooks from',
  security: dash,
  request: { body: { content: { 'application/json': { schema: lockDaySchema } } } },
  responses: { 201: { description: 'Production plan locked' } },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/production/plans',
  tags: TAG,
  summary: 'List locked production plans',
  security: dash,
  request: { query: listPlansQuerySchema },
  responses: { 200: { description: 'Production plans' } },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/production/plans/{id}',
  tags: TAG,
  summary: 'Get a locked production plan',
  security: dash,
  request: { params: idParamsSchema },
  responses: { 200: { description: 'Production plan' } },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/production/plans/{id}/status',
  tags: TAG,
  summary: 'Move a production plan through its states',
  security: dash,
  request: {
    params: idParamsSchema,
    body: { content: { 'application/json': { schema: planStatusSchema } } },
  },
  responses: { 200: { description: 'Production plan updated' } },
});
