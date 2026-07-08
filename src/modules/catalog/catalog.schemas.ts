import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry, SuccessEnvelopeSchema } from '../../core/openapi/registry';

extendZodWithOpenApi(z);

export const idParamsSchema = z.object({ id: z.string().uuid() });
export const productLangParamsSchema = z.object({
  id: z.string().uuid(),
  lang: z.string().min(2).max(10),
});
export const variantIdParamsSchema = z.object({
  id: z.string().uuid(),
  variantId: z.string().uuid(),
});
export const groupIdParamsSchema = z.object({
  id: z.string().uuid(),
  groupId: z.string().uuid(),
});
export const availabilityIdParamsSchema = z.object({
  id: z.string().uuid(),
  availabilityId: z.string().uuid(),
});
export const productTagParamsSchema = z.object({
  id: z.string().uuid(),
  tagId: z.string().uuid(),
});

export const categorySchema = z
  .object({
    id: z.string().uuid(),
    parentCategoryId: z.string().uuid().nullable(),
    name: z.string(),
    nameAr: z.string().nullable().optional(),
    slug: z.string(),
    imageUrl: z.string().nullable().optional(),
    sortOrder: z.number().int(),
    isActive: z.boolean(),
  })
  .openapi('Category');

export const createCategorySchema = z.object({
  parentCategoryId: z.string().uuid().optional(),
  name: z.string().min(1).max(150),
  nameAr: z.string().max(150).optional(),
  slug: z.string().min(1).max(150),
  imageUrl: z.string().url().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const updateCategorySchema = createCategorySchema.partial().extend({
  parentCategoryId: z.string().uuid().nullable().optional(),
});

export const productSchema = z
  .object({
    id: z.string().uuid(),
    categoryId: z.string().uuid(),
    sku: z.string().nullable(),
    barcode: z.string().nullable(),
    name: z.string(),
    description: z.string().nullable(),
    imageUrl: z.string().nullable().optional(),
    prepTimeMins: z.number().int().nullable().optional(),
    basePrice: z.string(),
    currency: z.string(),
    taxClass: z.string().nullable(),
    isActive: z.boolean(),
    visibility: z.string(),
    sortOrder: z.number().int(),
    erpReferenceId: z.string().nullable().optional(),
    posReferenceId: z.string().nullable().optional(),
    attributes: z.unknown().nullable(),
  })
  .openapi('Product');

export const listProductsQuerySchema = z.object({
  categoryId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export const createProductSchema = z.object({
  categoryId: z.string().uuid(),
  sku: z.string().max(100).optional(),
  barcode: z.string().max(100).optional(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  imageUrl: z.string().url().optional(),
  prepTimeMins: z.number().int().positive().optional(),
  basePrice: z.string(),
  currency: z.string().length(3),
  taxClass: z.string().optional(),
  isActive: z.boolean().optional(),
  visibility: z.enum(['public', 'restricted']).optional(),
  sortOrder: z.number().int().optional(),
  erpReferenceId: z.string().max(100).optional(),
  posReferenceId: z.string().max(100).optional(),
  attributes: z.record(z.unknown()).optional(),
});

export const updateProductSchema = createProductSchema.partial().extend({
  sku: z.string().max(100).nullable().optional(),
  barcode: z.string().max(100).nullable().optional(),
  description: z.string().nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  prepTimeMins: z.number().int().positive().nullable().optional(),
  taxClass: z.string().nullable().optional(),
  attributes: z.record(z.unknown()).nullable().optional(),
});

export const mediaIdParamsSchema = z.object({
  id: z.string().uuid(),
  mediaId: z.string().uuid(),
});

export const setProductImageUrlSchema = z.object({
  imageUrl: z.string().url().nullable(),
});

export const upsertTranslationSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
});

export const createVariantSchema = z.object({
  variantName: z.string().min(1).max(150),
  sku: z.string().max(100).optional(),
  priceAdjustment: z.string().optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const updateVariantSchema = createVariantSchema.partial().extend({
  sku: z.string().max(100).nullable().optional(),
});

export const createOptionGroupSchema = z.object({
  name: z.string().min(1).max(150),
  selectionType: z.enum(['single', 'multiple']).optional(),
  minSelect: z.number().int().optional(),
  maxSelect: z.number().int().optional(),
  isRequired: z.boolean().optional(),
  options: z
    .array(
      z.object({
        name: z.string().min(1).max(150),
        priceAdjustment: z.string().optional(),
        isActive: z.boolean().optional(),
        sortOrder: z.number().int().optional(),
      }),
    )
    .optional(),
});

export const updateOptionGroupSchema = createOptionGroupSchema
  .omit({ options: true })
  .partial();

export const createAvailabilitySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  availableFrom: z.string().optional(),
  availableTo: z.string().optional(),
});

export const updateAvailabilitySchema = createAvailabilitySchema.partial().extend({
  dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  availableFrom: z.string().nullable().optional(),
  availableTo: z.string().nullable().optional(),
});

export const addProductTagSchema = z.object({
  tagName: z.string().min(1).max(100),
});

export const createPricingListSchema = z.object({
  name: z.string().min(1).max(150),
  currency: z.string().length(3),
  isDefault: z.boolean().optional(),
});

export const createPriceSchema = z.object({
  pricingListId: z.string().uuid(),
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  price: z.string(),
  effectiveFrom: z.string().datetime().optional(),
  effectiveTo: z.string().datetime().optional(),
});

export const assignCompanyPricingListSchema = z.object({
  companyId: z.string().uuid(),
  pricingListId: z.string().uuid(),
  effectiveFrom: z.string().datetime().optional(),
  effectiveTo: z.string().datetime().optional(),
});

export const companyCatalogMenuSchema = z
  .object({
    menu: z
      .object({
        id: z.string().uuid(),
        name: z.string(),
        menuType: z.string(),
        description: z.string().nullable(),
      })
      .nullable(),
    sections: z.array(z.unknown()),
  })
  .openapi('CompanyCatalogMenu');

registry.registerPath({
  method: 'get',
  path: '/api/v1/company/catalog/menu',
  tags: ['Catalog'],
  summary: 'Browse assigned catalog menu for the authenticated company user',
  security: [{ companyBearerAuth: [] }],
  responses: {
    200: {
      description: 'Resolved menu with sections and priced products',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(companyCatalogMenuSchema) },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/catalog/categories',
  tags: ['Catalog'],
  summary: 'List product categories',
  security: [{ dashboardBearerAuth: [] }],
  responses: {
    200: {
      description: 'Category list',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(z.array(categorySchema)) },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/catalog/categories',
  tags: ['Catalog'],
  summary: 'Create category',
  security: [{ dashboardBearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: createCategorySchema } } } },
  responses: {
    201: {
      description: 'Category created',
      content: { 'application/json': { schema: SuccessEnvelopeSchema(categorySchema) } },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/catalog/products',
  tags: ['Catalog'],
  summary: 'List products',
  security: [{ dashboardBearerAuth: [] }],
  request: { query: listProductsQuerySchema },
  responses: {
    200: { description: 'Paginated product list' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/catalog/products',
  tags: ['Catalog'],
  summary: 'Create product',
  security: [{ dashboardBearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: createProductSchema } } } },
  responses: {
    201: {
      description: 'Product created',
      content: { 'application/json': { schema: SuccessEnvelopeSchema(productSchema) } },
    },
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/dashboard/catalog/products/{id}/translations/{lang}',
  tags: ['Catalog'],
  summary: 'Upsert product translation',
  security: [{ dashboardBearerAuth: [] }],
  request: {
    params: productLangParamsSchema,
    body: { content: { 'application/json': { schema: upsertTranslationSchema } } },
  },
  responses: { 200: { description: 'Translation upserted' } },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/catalog/pricing-lists',
  tags: ['Catalog'],
  summary: 'Create pricing list',
  security: [{ dashboardBearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: createPricingListSchema } } } },
  responses: { 201: { description: 'Pricing list created' } },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/catalog/prices',
  tags: ['Catalog'],
  summary: 'Create tiered price',
  security: [{ dashboardBearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: createPriceSchema } } } },
  responses: { 201: { description: 'Price created' } },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/catalog/company-assignment',
  tags: ['Catalog'],
  summary: 'Assign pricing list to company',
  security: [{ dashboardBearerAuth: [] }],
  request: {
    body: { content: { 'application/json': { schema: assignCompanyPricingListSchema } } },
  },
  responses: { 201: { description: 'Assignment created' } },
});
