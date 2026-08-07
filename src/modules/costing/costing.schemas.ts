import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry, SuccessEnvelopeSchema } from '../../core/openapi/registry';
import { DIMENSIONS, UNITS } from '../../engines/unitConverter';

extendZodWithOpenApi(z);

const decimalString = z.string().regex(/^\d+(\.\d+)?$/, 'Expected a positive number');

export const idParamsSchema = z.object({ id: z.string().uuid() });

export const listIngredientsQuerySchema = z.object({
  search: z.string().max(120).optional(),
  supplierId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});

export const createSupplierSchema = z.object({
  name: z.string().min(1).max(180),
  code: z.string().max(60).optional(),
  nameAr: z.string().max(180).optional(),
  contactName: z.string().max(150).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().email().max(180).optional(),
  notes: z.string().max(2000).optional(),
});

export const createIngredientSchema = z.object({
  name: z.string().min(1).max(180),
  nameAr: z.string().max(180).optional(),
  sku: z.string().max(100).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  supplierId: z.string().uuid().nullable().optional(),
  dimension: z.enum(DIMENSIONS),
  purchasePrice: decimalString,
  purchaseQty: decimalString,
  purchaseUom: z.enum(UNITS as [string, ...string[]]),
  currency: z.string().length(3),
  yieldPercent: decimalString.optional(),
  notes: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const updateIngredientSchema = createIngredientSchema
  .partial()
  .extend({ changeReason: z.string().max(200).optional() });

export const bulkPriceSchema = z.object({
  reason: z.string().max(200).optional(),
  items: z
    .array(
      z.object({
        ingredientId: z.string().uuid(),
        purchasePrice: decimalString,
        purchaseQty: decimalString.optional(),
      }),
    )
    .min(1)
    .max(500),
});

const recipeLineSchema = z
  .object({
    ingredientId: z.string().uuid().nullable().optional(),
    subRecipeId: z.string().uuid().nullable().optional(),
    quantity: decimalString,
    uom: z.string().min(1).max(20),
    isOptional: z.boolean().optional(),
    note: z.string().max(200).nullable().optional(),
  })
  .refine((v) => Boolean(v.ingredientId) !== Boolean(v.subRecipeId), {
    message: 'A line must reference exactly one of ingredientId or subRecipeId',
  });

export const createRecipeSchema = z.object({
  name: z.string().min(1).max(180),
  nameAr: z.string().max(180).optional(),
  recipeType: z.enum(['menu_item', 'prep']),
  productId: z.string().uuid().nullable().optional(),
  variantId: z.string().uuid().nullable().optional(),
  yieldQty: decimalString,
  yieldUom: z.string().min(1).max(20),
  lines: z.array(recipeLineSchema).min(1).max(200),
});

export const replaceLinesSchema = z.object({
  lines: z.array(recipeLineSchema).min(1).max(200),
});

export const recipeStatusSchema = z.object({
  status: z.enum(['draft', 'active', 'archived']),
});

export const manualCostSchema = z.object({
  variantId: z.string().uuid().nullable().optional(),
  foodCost: decimalString,
  packagingCost: decimalString.optional(),
  currency: z.string().length(3).optional(),
});

export const listCostsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
  costStatus: z.string().max(30).optional(),
});

export const ingredientSchema = z
  .object({
    id: z.string().uuid(),
    sku: z.string().nullable(),
    name: z.string(),
    dimension: z.string(),
    baseUom: z.string(),
    purchasePrice: z.string(),
    purchaseQty: z.string(),
    purchaseUom: z.string(),
    currency: z.string(),
    yieldPercent: z.string(),
    costPerBaseUnit: z.string(),
    isActive: z.boolean(),
  })
  .openapi('Ingredient');

export const productCostSchema = z
  .object({
    productId: z.string().uuid(),
    productName: z.string().nullable(),
    variantId: z.string().uuid().nullable(),
    currency: z.string(),
    foodCost: z.string(),
    packagingCost: z.string(),
    totalCost: z.string(),
    sellingPrice: z.string().nullable(),
    marginValue: z.string().nullable(),
    marginPercent: z.string().nullable(),
    isCosted: z.boolean(),
    costStatus: z.string(),
  })
  .openapi('ProductCost');

const dash = [{ dashboardBearerAuth: [] }];
const TAG = ['Costing'];
const okAny = (d: string) => ({ 200: { description: d }, 201: { description: d }, 204: { description: d } });

for (const [method, path, summary] of [
  ['get', '/api/v1/dashboard/costing/suppliers', 'List suppliers'],
  ['post', '/api/v1/dashboard/costing/suppliers', 'Create supplier'],
  ['get', '/api/v1/dashboard/costing/ingredients', 'List ingredients'],
  ['post', '/api/v1/dashboard/costing/ingredients', 'Create ingredient'],
  ['get', '/api/v1/dashboard/costing/ingredients/{id}', 'Get ingredient'],
  ['patch', '/api/v1/dashboard/costing/ingredients/{id}', 'Update ingredient and recost what it touches'],
  ['delete', '/api/v1/dashboard/costing/ingredients/{id}', 'Remove an unused ingredient'],
  ['get', '/api/v1/dashboard/costing/ingredients/{id}/history', 'Ingredient price history'],
  ['post', '/api/v1/dashboard/costing/ingredients/bulk-price', 'Bulk price update'],
  ['get', '/api/v1/dashboard/costing/recipes', 'List recipes'],
  ['post', '/api/v1/dashboard/costing/recipes', 'Create recipe'],
  ['get', '/api/v1/dashboard/costing/recipes/{id}', 'Get recipe with per-line cost'],
  ['put', '/api/v1/dashboard/costing/recipes/{id}/lines', 'Replace recipe lines'],
  ['post', '/api/v1/dashboard/costing/recipes/{id}/status', 'Set recipe status'],
  ['get', '/api/v1/dashboard/costing/products', 'Product cost and margin'],
  ['get', '/api/v1/dashboard/costing/summary', 'Costing coverage summary'],
  ['post', '/api/v1/dashboard/costing/products/{id}/manual-cost', 'Set a manual cost'],
  ['post', '/api/v1/dashboard/costing/recost', 'Recost every product'],
] as const) {
  registry.registerPath({
    method: method as 'get' | 'post' | 'put' | 'patch' | 'delete',
    path,
    tags: TAG,
    summary,
    security: dash,
    responses: okAny(summary),
  });
}

export const costingSchemas = { ingredientSchema, productCostSchema, SuccessEnvelopeSchema };
