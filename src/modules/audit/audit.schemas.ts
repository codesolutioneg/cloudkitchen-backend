import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry, SuccessEnvelopeSchema } from '../../core/openapi/registry';

extendZodWithOpenApi(z);

export const listAuditLogsQuerySchema = z.object({
  entityName: z.string().optional(),
  entityId: z.string().uuid().optional(),
  correlationId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

const auditLogSchema = z
  .object({
    id: z.string().uuid(),
    entityName: z.string(),
    entityId: z.string().uuid(),
    action: z.string(),
    changedAt: z.string(),
    correlationId: z.string().uuid(),
  })
  .openapi('AuditLog');

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/audit-logs',
  tags: ['Audit'],
  summary: 'List audit logs',
  security: [{ dashboardBearerAuth: [] }],
  request: { query: listAuditLogsQuerySchema },
  responses: {
    200: {
      description: 'Paginated audit log list',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(z.array(auditLogSchema)) },
      },
    },
  },
});
