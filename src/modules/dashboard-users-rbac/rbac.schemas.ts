import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry, SuccessEnvelopeSchema } from '../../core/openapi/registry';

extendZodWithOpenApi(z);

const roleSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  scope: z.string(),
  isSystemRole: z.boolean(),
  description: z.string().nullable(),
});

export const createRoleSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  isSystemRole: z.boolean().optional(),
});

export const updateRoleSchema = createRoleSchema.partial();
export const roleIdParamsSchema = z.object({ id: z.string().uuid() });
export const userIdParamsSchema = z.object({ id: z.string().uuid() });
export const companyIdParamsSchema = z.object({ id: z.string().uuid() });

export const setRolePermissionsSchema = z.object({
  permissions: z.array(
    z.object({
      permissionId: z.string().uuid(),
      effect: z.enum(['allow', 'deny']),
    }),
  ),
});

export const setRolePagePermissionsSchema = z.object({
  pages: z.array(
    z.object({
      pageId: z.string().uuid(),
      canView: z.boolean().optional(),
      canCreate: z.boolean().optional(),
      canEdit: z.boolean().optional(),
      canDelete: z.boolean().optional(),
      canApprove: z.boolean().optional(),
      canReject: z.boolean().optional(),
      canExport: z.boolean().optional(),
      canImport: z.boolean().optional(),
    }),
  ),
});

export const inviteUserSchema = z.object({
  fullName: z.string().min(2).max(150),
  email: z.string().email(),
  department: z.string().max(100).optional(),
  temporaryPassword: z.string().min(8).optional(),
});

export const assignRolesSchema = z.object({
  roleIds: z.array(z.string().uuid()),
});

export const companyScopeSchema = z.object({
  scopeType: z.enum(['all', 'specific']),
  companyIds: z.array(z.string().uuid()).optional(),
});

const dashboardUserSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
  email: z.string().email(),
  status: z.string(),
  department: z.string().nullable(),
  roles: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
  createdAt: z.string().datetime(),
});

export const listDashboardUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/roles',
  tags: ['Dashboard RBAC'],
  summary: 'List roles',
  security: [{ dashboardBearerAuth: [] }],
  responses: {
    200: {
      description: 'Roles',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(z.array(roleSchema)) },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/roles',
  tags: ['Dashboard RBAC'],
  summary: 'Create role',
  security: [{ dashboardBearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: createRoleSchema } } } },
  responses: {
    201: {
      description: 'Created role',
      content: { 'application/json': { schema: SuccessEnvelopeSchema(roleSchema) } },
    },
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/dashboard/roles/{id}',
  tags: ['Dashboard RBAC'],
  summary: 'Update role',
  security: [{ dashboardBearerAuth: [] }],
  request: {
    params: roleIdParamsSchema,
    body: { content: { 'application/json': { schema: updateRoleSchema } } },
  },
  responses: {
    200: {
      description: 'Updated role',
      content: { 'application/json': { schema: SuccessEnvelopeSchema(roleSchema) } },
    },
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/dashboard/roles/{id}/permissions',
  tags: ['Dashboard RBAC'],
  summary: 'Bulk set role permissions',
  security: [{ dashboardBearerAuth: [] }],
  request: {
    params: roleIdParamsSchema,
    body: { content: { 'application/json': { schema: setRolePermissionsSchema } } },
  },
  responses: { 200: { description: 'Updated' } },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/dashboard/roles/{id}/page-permissions',
  tags: ['Dashboard RBAC'],
  summary: 'Bulk set role page permissions',
  security: [{ dashboardBearerAuth: [] }],
  request: {
    params: roleIdParamsSchema,
    body: { content: { 'application/json': { schema: setRolePagePermissionsSchema } } },
  },
  responses: { 200: { description: 'Updated' } },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/users',
  tags: ['Dashboard RBAC'],
  summary: 'Invite dashboard user',
  security: [{ dashboardBearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: inviteUserSchema } } } },
  responses: { 201: { description: 'Invited' } },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/users/{id}/roles',
  tags: ['Dashboard RBAC'],
  summary: 'Assign roles to dashboard user',
  security: [{ dashboardBearerAuth: [] }],
  request: {
    params: userIdParamsSchema,
    body: { content: { 'application/json': { schema: assignRolesSchema } } },
  },
  responses: { 200: { description: 'Assigned' } },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/dashboard/users/{id}/company-scope',
  tags: ['Dashboard RBAC'],
  summary: 'Set dashboard user company scope',
  security: [{ dashboardBearerAuth: [] }],
  request: {
    params: userIdParamsSchema,
    body: { content: { 'application/json': { schema: companyScopeSchema } } },
  },
  responses: { 200: { description: 'Scope updated' } },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/companies/{id}/users',
  tags: ['Dashboard RBAC'],
  summary: 'List company users (support)',
  security: [{ dashboardBearerAuth: [] }],
  request: { params: companyIdParamsSchema },
  responses: { 200: { description: 'Users' } },
});
