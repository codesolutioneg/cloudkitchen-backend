import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry, SuccessEnvelopeSchema } from '../../core/openapi/registry';

extendZodWithOpenApi(z);

export const jobIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const listJobsQuerySchema = z.object({
  status: z.enum(['pending', 'running', 'completed', 'failed', 'retrying', 'cancelled']).optional(),
  jobType: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

const backgroundJobSchema = z
  .object({
    id: z.string().uuid(),
    jobType: z.string(),
    status: z.string(),
    queueName: z.string(),
    retryCount: z.number(),
    maxRetries: z.number(),
    createdAt: z.string(),
  })
  .openapi('BackgroundJob');

const jobDetailSchema = backgroundJobSchema
  .extend({
    payload: z.unknown(),
    lastError: z.string().nullable(),
    startedAt: z.string().nullable(),
    completedAt: z.string().nullable(),
  })
  .openapi('BackgroundJobDetail');

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/jobs',
  tags: ['Jobs'],
  summary: 'List background jobs',
  security: [{ dashboardBearerAuth: [] }],
  request: { query: listJobsQuerySchema },
  responses: {
    200: {
      description: 'Paginated job list',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(z.array(backgroundJobSchema)) },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/jobs/{id}',
  tags: ['Jobs'],
  summary: 'Get background job detail',
  security: [{ dashboardBearerAuth: [] }],
  request: { params: jobIdParamsSchema },
  responses: {
    200: {
      description: 'Job detail',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(jobDetailSchema) },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/jobs/{id}/retry',
  tags: ['Jobs'],
  summary: 'Retry a failed job',
  security: [{ dashboardBearerAuth: [] }],
  request: { params: jobIdParamsSchema },
  responses: {
    200: {
      description: 'Job requeued',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(backgroundJobSchema) },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/jobs/{id}/cancel',
  tags: ['Jobs'],
  summary: 'Cancel a pending job',
  security: [{ dashboardBearerAuth: [] }],
  request: { params: jobIdParamsSchema },
  responses: {
    200: {
      description: 'Job cancelled',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(backgroundJobSchema) },
      },
    },
  },
});
