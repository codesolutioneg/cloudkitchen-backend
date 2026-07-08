import { extendZodWithOpenApi, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

registry.registerComponent('securitySchemes', 'companyBearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  description: 'Company-user JWT (audience: company)',
});

registry.registerComponent('securitySchemes', 'dashboardBearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  description: 'Dashboard-user JWT (audience: dashboard)',
});

const HealthDataSchema = z
  .object({
    status: z.literal('ok'),
  })
  .openapi('HealthData');

const SuccessEnvelopeSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
    meta: z.object({
      correlationId: z.string(),
      pagination: z
        .object({
          page: z.number().int(),
          pageSize: z.number().int(),
          totalItems: z.number().int(),
        })
        .optional(),
    }),
  });

const ErrorEnvelopeSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
  meta: z.object({
    correlationId: z.string(),
  }),
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/health',
  tags: ['Health'],
  summary: 'Health check',
  description: 'Unauthenticated liveness probe.',
  responses: {
    200: {
      description: 'Service is healthy',
      content: {
        'application/json': {
          schema: SuccessEnvelopeSchema(HealthDataSchema),
        },
      },
    },
    500: {
      description: 'Service unhealthy',
      content: {
        'application/json': {
          schema: ErrorEnvelopeSchema,
        },
      },
    },
  },
});

export { HealthDataSchema, SuccessEnvelopeSchema, ErrorEnvelopeSchema };
