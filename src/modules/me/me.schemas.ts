import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry, SuccessEnvelopeSchema } from '../../core/openapi/registry';

extendZodWithOpenApi(z);

export const companyModulesResponseSchema = z
  .record(z.string(), z.boolean())
  .openapi('CompanyModulesMap');

const navigationPermissionsSchema = z.object({
  canView: z.boolean(),
  canCreate: z.boolean(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
  canApprove: z.boolean(),
  canReject: z.boolean(),
  canExport: z.boolean(),
  canImport: z.boolean(),
});

/** Flat OpenAPI shape (recursive tree documented as nested objects without z.lazy). */
export const navigationNodeSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    route: z.string(),
    icon: z.string().nullable(),
    sortOrder: z.number().int(),
    permissions: navigationPermissionsSchema,
    children: z.array(
      z.object({
        id: z.string().uuid(),
        name: z.string(),
        route: z.string(),
        icon: z.string().nullable(),
        sortOrder: z.number().int(),
        permissions: navigationPermissionsSchema,
        children: z.array(z.record(z.string(), z.unknown())),
      }),
    ),
  })
  .openapi('NavigationNode');

export const navigationTreeSchema = z.array(navigationNodeSchema).openapi('NavigationTree');

registry.registerPath({
  method: 'get',
  path: '/api/v1/me/modules',
  tags: ['Me'],
  summary: 'Resolved company feature flags for the authenticated company user',
  security: [{ companyBearerAuth: [] }],
  responses: {
    200: {
      description: 'Flat feature code → enabled map',
      content: {
        'application/json': {
          schema: SuccessEnvelopeSchema(companyModulesResponseSchema),
        },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/me/navigation',
  tags: ['Me'],
  summary: 'Dashboard navigation tree for the authenticated dashboard user',
  security: [{ dashboardBearerAuth: [] }],
  responses: {
    200: {
      description: 'Hierarchical navigation nodes with page permissions',
      content: {
        'application/json': {
          schema: SuccessEnvelopeSchema(navigationTreeSchema),
        },
      },
    },
  },
});
