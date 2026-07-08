import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry, SuccessEnvelopeSchema } from '../../core/openapi/registry';

extendZodWithOpenApi(z);

export const idParamsSchema = z.object({ id: z.string().uuid() });
export const companyIdParamsSchema = z.object({ companyId: z.string().uuid() });
export const roleIdParamsSchema = z.object({ roleId: z.string().uuid() });

export const featureSchema = z
  .object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
    featureGroupId: z.string().uuid().nullable(),
    moduleId: z.string().uuid().nullable(),
    description: z.string().nullable(),
    isGlobalDefaultEnabled: z.boolean(),
    requiresPermissionId: z.string().uuid().nullable(),
  })
  .openapi('Feature');

export const createFeatureSchema = z.object({
  code: z.string().min(1).max(100),
  name: z.string().min(1).max(150),
  featureGroupId: z.string().uuid().optional(),
  moduleId: z.string().uuid().optional(),
  description: z.string().optional(),
  isGlobalDefaultEnabled: z.boolean().optional(),
  requiresPermissionId: z.string().uuid().optional(),
});

export const updateFeatureSchema = createFeatureSchema
  .omit({ code: true })
  .partial()
  .extend({
    featureGroupId: z.string().uuid().nullable().optional(),
    moduleId: z.string().uuid().nullable().optional(),
    requiresPermissionId: z.string().uuid().nullable().optional(),
  });

export const featureGroupSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    sortOrder: z.number().int(),
  })
  .openapi('FeatureGroup');

export const createFeatureGroupSchema = z.object({
  name: z.string().min(1).max(100),
  sortOrder: z.number().int().optional(),
});

export const updateFeatureGroupSchema = createFeatureGroupSchema.partial();

export const moduleSchema = z
  .object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    isCore: z.boolean(),
    sortOrder: z.number().int(),
    audience: z.enum(['company', 'dashboard']),
  })
  .openapi('Module');

export const listModulesQuerySchema = z.object({
  audience: z.enum(['company', 'dashboard']).optional(),
});

export const createModuleSchema = z.object({
  code: z.string().min(1).max(100),
  name: z.string().min(1).max(150),
  description: z.string().optional(),
  isCore: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  audience: z.enum(['company', 'dashboard']),
});

export const updateModuleSchema = createModuleSchema.omit({ code: true }).partial();

export const companyFeatureSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  featureId: z.string().uuid(),
  featureCode: z.string(),
  isEnabled: z.boolean(),
  enabledFrom: z.string().datetime().nullable(),
  enabledUntil: z.string().datetime().nullable(),
  config: z.unknown().nullable(),
});

export const upsertCompanyFeaturesSchema = z.object({
  features: z.array(
    z.object({
      featureId: z.string().uuid(),
      isEnabled: z.boolean(),
      enabledFrom: z.string().datetime().optional(),
      enabledUntil: z.string().datetime().optional(),
      config: z.record(z.unknown()).optional(),
    }),
  ),
});

export const companyModuleSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  moduleId: z.string().uuid(),
  moduleCode: z.string(),
  isEnabled: z.boolean(),
  enabledFrom: z.string().datetime().nullable(),
  enabledUntil: z.string().datetime().nullable(),
});

export const upsertCompanyModulesSchema = z.object({
  modules: z.array(
    z.object({
      moduleId: z.string().uuid(),
      isEnabled: z.boolean(),
      enabledFrom: z.string().datetime().optional(),
      enabledUntil: z.string().datetime().optional(),
    }),
  ),
});

export const featureFlagSchema = z
  .object({
    id: z.string().uuid(),
    key: z.string(),
    description: z.string().nullable(),
    isEnabledGlobally: z.boolean(),
    rolloutPercentage: z.number().int(),
    environment: z.string(),
    targetingRules: z.unknown().nullable(),
  })
  .openapi('FeatureFlag');

export const createFeatureFlagSchema = z.object({
  key: z.string().min(1).max(150),
  description: z.string().optional(),
  isEnabledGlobally: z.boolean().optional(),
  rolloutPercentage: z.number().int().min(0).max(100).optional(),
  environment: z.string().optional(),
  targetingRules: z.record(z.unknown()).optional(),
});

export const updateFeatureFlagSchema = createFeatureFlagSchema
  .omit({ key: true })
  .partial()
  .extend({ targetingRules: z.record(z.unknown()).nullable().optional() });

export const dashboardPageSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    route: z.string(),
    icon: z.string().nullable(),
    parentId: z.string().uuid().nullable(),
    sortOrder: z.number().int(),
    moduleId: z.string().uuid().nullable(),
    featureId: z.string().uuid().nullable(),
    isVisible: z.boolean(),
    isEnabled: z.boolean(),
  })
  .openapi('DashboardPage');

export const createDashboardPageSchema = z.object({
  name: z.string().min(1).max(150),
  route: z.string().min(1).max(255),
  icon: z.string().max(100).optional(),
  parentId: z.string().uuid().optional(),
  sortOrder: z.number().int().optional(),
  moduleId: z.string().uuid().optional(),
  featureId: z.string().uuid().optional(),
  isVisible: z.boolean().optional(),
  isEnabled: z.boolean().optional(),
});

export const updateDashboardPageSchema = createDashboardPageSchema.partial().extend({
  parentId: z.string().uuid().nullable().optional(),
  moduleId: z.string().uuid().nullable().optional(),
  featureId: z.string().uuid().nullable().optional(),
});

export const setRoleModulesSchema = z.object({
  modules: z.array(
    z.object({
      moduleId: z.string().uuid(),
      isEnabled: z.boolean(),
    }),
  ),
});

export const setRoleFeaturesSchema = z.object({
  features: z.array(
    z.object({
      featureId: z.string().uuid(),
      isEnabled: z.boolean(),
    }),
  ),
});

const dashboardSecurity = [{ dashboardBearerAuth: [] as string[] }];

function registerDashboardPath(
  method: 'get' | 'post' | 'patch' | 'put' | 'delete',
  path: string,
  summary: string,
  options: {
    request?: Record<string, unknown>;
    responseSchema?: z.ZodTypeAny;
    status?: number;
  } = {},
) {
  registry.registerPath({
    method,
    path: `/api/v1${path}`,
    tags: ['Features & Dashboard'],
    summary,
    security: dashboardSecurity,
    ...(options.request ? { request: options.request } : {}),
    responses: {
      [options.status ?? (method === 'post' ? 201 : 200)]: {
        description: summary,
        content: options.responseSchema
          ? { 'application/json': { schema: SuccessEnvelopeSchema(options.responseSchema) } }
          : undefined,
      },
    },
  });
}

registerDashboardPath('get', '/dashboard/features', 'List features', {
  responseSchema: z.array(featureSchema),
});
registerDashboardPath('post', '/dashboard/features', 'Create feature', {
  request: { body: { content: { 'application/json': { schema: createFeatureSchema } } } },
  responseSchema: featureSchema,
});
registerDashboardPath('patch', '/dashboard/features/{id}', 'Update feature', {
  request: {
    params: idParamsSchema,
    body: { content: { 'application/json': { schema: updateFeatureSchema } } },
  },
  responseSchema: featureSchema,
});
registerDashboardPath('delete', '/dashboard/features/{id}', 'Delete feature', {
  request: { params: idParamsSchema },
});

registerDashboardPath('get', '/dashboard/feature-groups', 'List feature groups', {
  responseSchema: z.array(featureGroupSchema),
});
registerDashboardPath('post', '/dashboard/feature-groups', 'Create feature group', {
  request: { body: { content: { 'application/json': { schema: createFeatureGroupSchema } } } },
  responseSchema: featureGroupSchema,
});

registerDashboardPath('get', '/dashboard/modules', 'List modules', {
  request: { query: listModulesQuerySchema },
  responseSchema: z.array(moduleSchema),
});
registerDashboardPath('post', '/dashboard/modules', 'Create module', {
  request: { body: { content: { 'application/json': { schema: createModuleSchema } } } },
  responseSchema: moduleSchema,
});

registerDashboardPath('get', '/dashboard/companies/{companyId}/features', 'List company features', {
  request: { params: companyIdParamsSchema },
  responseSchema: z.array(companyFeatureSchema),
});
registerDashboardPath('put', '/dashboard/companies/{companyId}/features', 'Upsert company features', {
  request: {
    params: companyIdParamsSchema,
    body: { content: { 'application/json': { schema: upsertCompanyFeaturesSchema } } },
  },
  responseSchema: z.array(companyFeatureSchema),
});

registerDashboardPath('get', '/dashboard/companies/{companyId}/modules', 'List company modules', {
  request: { params: companyIdParamsSchema },
  responseSchema: z.array(companyModuleSchema),
});
registerDashboardPath('put', '/dashboard/companies/{companyId}/modules', 'Upsert company modules', {
  request: {
    params: companyIdParamsSchema,
    body: { content: { 'application/json': { schema: upsertCompanyModulesSchema } } },
  },
  responseSchema: z.array(companyModuleSchema),
});

registerDashboardPath('get', '/dashboard/feature-flags', 'List feature flags', {
  responseSchema: z.array(featureFlagSchema),
});
registerDashboardPath('post', '/dashboard/feature-flags', 'Create feature flag', {
  request: { body: { content: { 'application/json': { schema: createFeatureFlagSchema } } } },
  responseSchema: featureFlagSchema,
});

registerDashboardPath('get', '/dashboard/dashboard-pages', 'List dashboard pages', {
  responseSchema: z.array(dashboardPageSchema),
});
registerDashboardPath('post', '/dashboard/dashboard-pages', 'Create dashboard page', {
  request: { body: { content: { 'application/json': { schema: createDashboardPageSchema } } } },
  responseSchema: dashboardPageSchema,
});

registerDashboardPath('get', '/dashboard/roles/{roleId}/modules', 'List role modules', {
  request: { params: roleIdParamsSchema },
});
registerDashboardPath('put', '/dashboard/roles/{roleId}/modules', 'Set role modules', {
  request: {
    params: roleIdParamsSchema,
    body: { content: { 'application/json': { schema: setRoleModulesSchema } } },
  },
});
registerDashboardPath('put', '/dashboard/roles/{roleId}/features', 'Set role features', {
  request: {
    params: roleIdParamsSchema,
    body: { content: { 'application/json': { schema: setRoleFeaturesSchema } } },
  },
});
