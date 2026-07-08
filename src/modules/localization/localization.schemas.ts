import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry, SuccessEnvelopeSchema } from '../../core/openapi/registry';

extendZodWithOpenApi(z);

export const languageCodeParamsSchema = z.object({
  code: z.string().min(2).max(10),
});

export const listTranslationsQuerySchema = z.object({
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
  languageCode: z.string().optional(),
});

export const createLanguageSchema = z.object({
  code: z.string().min(2).max(10),
  name: z.string().min(1).max(100),
  nativeName: z.string().min(1).max(100),
  isRtl: z.boolean().optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

export const updateLanguageSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  nativeName: z.string().min(1).max(100).optional(),
  isRtl: z.boolean().optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

export const upsertTranslationsSchema = z.object({
  translations: z
    .array(
      z.object({
        entityType: z.string().min(1).max(50),
        entityId: z.string().uuid(),
        fieldName: z.string().min(1).max(100),
        languageCode: z.string().min(2).max(10),
        translatedValue: z.string().min(1),
      }),
    )
    .min(1),
});

const languageSchema = z
  .object({
    code: z.string(),
    name: z.string(),
    nativeName: z.string(),
    isRtl: z.boolean(),
    isActive: z.boolean(),
    isDefault: z.boolean(),
  })
  .openapi('Language');

const translationSchema = z
  .object({
    id: z.string(),
    entityType: z.string(),
    entityId: z.string().uuid(),
    fieldName: z.string(),
    languageCode: z.string(),
    translatedValue: z.string(),
  })
  .openapi('Translation');

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/languages',
  tags: ['Localization'],
  summary: 'List all languages',
  security: [{ dashboardBearerAuth: [] }],
  responses: {
    200: {
      description: 'Language list',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(z.array(languageSchema)) },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/languages',
  tags: ['Localization'],
  summary: 'Create language',
  security: [{ dashboardBearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: createLanguageSchema } } } },
  responses: {
    201: {
      description: 'Language created',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(languageSchema) },
      },
    },
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/dashboard/languages/{code}',
  tags: ['Localization'],
  summary: 'Update language',
  security: [{ dashboardBearerAuth: [] }],
  request: {
    params: languageCodeParamsSchema,
    body: { content: { 'application/json': { schema: updateLanguageSchema } } },
  },
  responses: {
    200: {
      description: 'Language updated',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(languageSchema) },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/translations',
  tags: ['Localization'],
  summary: 'List translations',
  security: [{ dashboardBearerAuth: [] }],
  request: { query: listTranslationsQuerySchema },
  responses: {
    200: {
      description: 'Translation list',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(z.array(translationSchema)) },
      },
    },
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/dashboard/translations',
  tags: ['Localization'],
  summary: 'Upsert translations batch',
  security: [{ dashboardBearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: upsertTranslationsSchema } } } },
  responses: {
    200: {
      description: 'Translations upserted',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(z.array(translationSchema)) },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/company/languages',
  tags: ['Localization'],
  summary: 'List active languages',
  security: [{ companyBearerAuth: [] }],
  responses: {
    200: {
      description: 'Active language list',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(z.array(languageSchema)) },
      },
    },
  },
});
