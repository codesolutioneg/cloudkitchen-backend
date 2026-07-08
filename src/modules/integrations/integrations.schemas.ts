import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry, SuccessEnvelopeSchema } from '../../core/openapi/registry';

extendZodWithOpenApi(z);

export const systemIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const listIntegrationEventsQuerySchema = z.object({
  status: z.string().optional(),
  entityType: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

export const createExternalSystemSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(150),
  systemType: z.enum(['erp', 'pos', 'crm', 'accounting', 'other']),
  baseUrl: z.string().url().optional(),
  authConfig: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

export const updateExternalSystemSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  systemType: z.enum(['erp', 'pos', 'crm', 'accounting', 'other']).optional(),
  baseUrl: z.string().url().optional().nullable(),
  authConfig: z.record(z.unknown()).optional().nullable(),
  isActive: z.boolean().optional(),
});

const externalSystemSchema = z
  .object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
    systemType: z.string(),
    isActive: z.boolean(),
  })
  .openapi('ExternalSystem');

const mappingSchema = z
  .object({
    id: z.string().uuid(),
    entityType: z.string(),
    entityId: z.string().uuid(),
    externalId: z.string(),
    syncStatus: z.string(),
  })
  .openapi('ExternalSystemMapping');

const integrationEventSchema = z
  .object({
    id: z.string().uuid(),
    eventCode: z.string(),
    entityType: z.string(),
    entityId: z.string().uuid(),
    status: z.string(),
    occurredAt: z.string(),
  })
  .openapi('IntegrationEvent');

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/integrations/systems',
  tags: ['Integrations'],
  summary: 'List external systems',
  security: [{ dashboardBearerAuth: [] }],
  responses: {
    200: {
      description: 'External systems list',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(z.array(externalSystemSchema)) },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/integrations/systems',
  tags: ['Integrations'],
  summary: 'Create external system',
  security: [{ dashboardBearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: createExternalSystemSchema } } } },
  responses: {
    201: {
      description: 'External system created',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(externalSystemSchema) },
      },
    },
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/dashboard/integrations/systems/{id}',
  tags: ['Integrations'],
  summary: 'Update external system',
  security: [{ dashboardBearerAuth: [] }],
  request: {
    params: systemIdParamsSchema,
    body: { content: { 'application/json': { schema: updateExternalSystemSchema } } },
  },
  responses: {
    200: {
      description: 'External system updated',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(externalSystemSchema) },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/integrations/systems/{id}/mappings',
  tags: ['Integrations'],
  summary: 'List mappings for external system',
  security: [{ dashboardBearerAuth: [] }],
  request: { params: systemIdParamsSchema },
  responses: {
    200: {
      description: 'Mapping list',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(z.array(mappingSchema)) },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/integrations/events',
  tags: ['Integrations'],
  summary: 'List integration events',
  security: [{ dashboardBearerAuth: [] }],
  request: { query: listIntegrationEventsQuerySchema },
  responses: {
    200: {
      description: 'Integration events list',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(z.array(integrationEventSchema)) },
      },
    },
  },
});
