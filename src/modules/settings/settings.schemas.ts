import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry, SuccessEnvelopeSchema } from '../../core/openapi/registry';

extendZodWithOpenApi(z);

export const companyIdParamsSchema = z.object({ companyId: z.string().uuid() });

export const settingsBodySchema = z.record(z.unknown());

export const companySettingsResponseSchema = z
  .object({
    companyId: z.string().uuid(),
    settings: z.record(z.unknown()),
  })
  .openapi('CompanySettings');

export const globalSettingsResponseSchema = z
  .object({
    settings: z.record(
      z.object({
        key: z.string(),
        value: z.unknown(),
        isOverridable: z.boolean(),
        description: z.string().nullable(),
      }),
    ),
  })
  .openapi('GlobalSettings');

registry.registerPath({
  method: 'get',
  path: '/api/v1/company/settings',
  tags: ['Settings'],
  summary: 'Get company settings for authenticated company user',
  security: [{ companyBearerAuth: [] }],
  responses: {
    200: {
      description: 'Company settings map',
      content: {
        'application/json': {
          schema: SuccessEnvelopeSchema(companySettingsResponseSchema),
        },
      },
    },
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/company/settings',
  tags: ['Settings'],
  summary: 'Update company settings (keys in body map)',
  security: [{ companyBearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: settingsBodySchema } } } },
  responses: { 200: { description: 'Updated company settings' } },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/settings/global',
  tags: ['Settings'],
  summary: 'Get global platform settings',
  security: [{ dashboardBearerAuth: [] }],
  responses: {
    200: {
      description: 'Global settings',
      content: {
        'application/json': {
          schema: SuccessEnvelopeSchema(globalSettingsResponseSchema),
        },
      },
    },
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/dashboard/settings/global',
  tags: ['Settings'],
  summary: 'Update global platform settings',
  security: [{ dashboardBearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: settingsBodySchema } } } },
  responses: { 200: { description: 'Updated global settings' } },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/settings/company/{companyId}',
  tags: ['Settings'],
  summary: 'Get company configuration overrides',
  security: [{ dashboardBearerAuth: [] }],
  request: { params: companyIdParamsSchema },
  responses: { 200: { description: 'Company settings overrides' } },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/dashboard/settings/company/{companyId}',
  tags: ['Settings'],
  summary: 'Update company configuration overrides',
  security: [{ dashboardBearerAuth: [] }],
  request: {
    params: companyIdParamsSchema,
    body: { content: { 'application/json': { schema: settingsBodySchema } } },
  },
  responses: { 200: { description: 'Updated company settings' } },
});
