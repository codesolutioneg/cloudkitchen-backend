import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry, SuccessEnvelopeSchema } from '../../core/openapi/registry';

extendZodWithOpenApi(z);

export const menuIdParamsSchema = z.object({ id: z.string().uuid() });
export const sectionIdParamsSchema = z.object({
  id: z.string().uuid(),
  sectionId: z.string().uuid(),
});
export const sectionProductParamsSchema = z.object({
  id: z.string().uuid(),
  sectionId: z.string().uuid(),
  productId: z.string().uuid(),
});
export const assignmentIdParamsSchema = z.object({
  id: z.string().uuid(),
  assignmentId: z.string().uuid(),
});

export const catalogMenuSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    menuType: z.string(),
    description: z.string().nullable(),
    isActive: z.boolean(),
  })
  .openapi('CatalogMenu');

export const createMenuSchema = z.object({
  name: z.string().min(1).max(150),
  menuType: z.string().min(1).max(30),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const updateMenuSchema = createMenuSchema.partial().extend({
  description: z.string().nullable().optional(),
});

export const createSectionSchema = z.object({
  name: z.string().min(1).max(150),
  sortOrder: z.number().int().optional(),
});

export const updateSectionSchema = createSectionSchema.partial();

export const addSectionProductSchema = z.object({
  productId: z.string().uuid(),
  sortOrder: z.number().int().optional(),
  isFeatured: z.boolean().optional(),
});

export const createAssignmentSchema = z.object({
  scopeType: z.enum(['company', 'department', 'user', 'campaign']),
  scopeId: z.string().uuid(),
  priority: z.number().int().optional(),
  effectiveFrom: z.string().datetime().optional(),
  effectiveTo: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/menus',
  tags: ['Menus'],
  summary: 'List catalog menus',
  security: [{ dashboardBearerAuth: [] }],
  responses: {
    200: {
      description: 'Menu list',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(z.array(catalogMenuSchema)) },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/menus',
  tags: ['Menus'],
  summary: 'Create catalog menu',
  security: [{ dashboardBearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: createMenuSchema } } } },
  responses: {
    201: {
      description: 'Menu created',
      content: { 'application/json': { schema: SuccessEnvelopeSchema(catalogMenuSchema) } },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/menus/{id}/sections',
  tags: ['Menus'],
  summary: 'Create menu section',
  security: [{ dashboardBearerAuth: [] }],
  request: {
    params: menuIdParamsSchema,
    body: { content: { 'application/json': { schema: createSectionSchema } } },
  },
  responses: { 201: { description: 'Section created' } },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/menus/{id}/sections/{sectionId}/products',
  tags: ['Menus'],
  summary: 'Attach product to menu section',
  security: [{ dashboardBearerAuth: [] }],
  request: {
    params: sectionIdParamsSchema,
    body: { content: { 'application/json': { schema: addSectionProductSchema } } },
  },
  responses: { 201: { description: 'Product attached' } },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/menus/{id}/assignments',
  tags: ['Menus'],
  summary: 'Assign menu to a scope',
  security: [{ dashboardBearerAuth: [] }],
  request: {
    params: menuIdParamsSchema,
    body: { content: { 'application/json': { schema: createAssignmentSchema } } },
  },
  responses: { 201: { description: 'Assignment created' } },
});
