import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry, SuccessEnvelopeSchema } from '../../core/openapi/registry';
import { COMPONENT_TYPES } from '../../engines/mealPlanOptimizer';

extendZodWithOpenApi(z);

export const componentTypeSchema = z.enum(COMPONENT_TYPES);

export const planIdParamsSchema = z.object({ id: z.string().uuid() });
export const dayIdParamsSchema = z.object({
  id: z.string().uuid(),
  dayId: z.string().uuid(),
});
export const itemIdParamsSchema = z.object({
  id: z.string().uuid(),
  dayId: z.string().uuid(),
  itemId: z.string().uuid(),
});

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date (YYYY-MM-DD)');

const money = z.string().regex(/^\d+(\.\d{1,2})?$/, 'Expected a money amount, e.g. "18.50"');
const grams = z.number().nonnegative().max(100000);

export const slotSpecSchema = z.object({
  componentType: componentTypeSchema,
  quantity: z.number().int().min(1).max(10),
});

const targetFields = {
  minCaloriesKcal: grams.nullable().optional(),
  maxCaloriesKcal: grams.nullable().optional(),
  minProteinG: grams.nullable().optional(),
  maxProteinG: grams.nullable().optional(),
  minCarbsG: grams.nullable().optional(),
  maxCarbsG: grams.nullable().optional(),
  maxFatG: grams.nullable().optional(),
};

export const listPlansQuerySchema = z.object({
  companyId: z.string().uuid().optional(),
  status: z.enum(['draft', 'generated', 'approved', 'archived']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});

export const createPlanSchema = z
  .object({
    companyId: z.string().uuid(),
    name: z.string().min(1).max(180),
    description: z.string().max(2000).optional(),
    startDate: isoDate,
    endDate: isoDate,
    headcount: z.number().int().min(1).max(1000000),
    budgetPerMeal: money,
    currency: z.string().length(3),
    pricingListId: z.string().uuid().nullable().optional(),
    sourceMenuId: z.string().uuid().nullable().optional(),
    slots: z.array(slotSpecSchema).min(1).max(10),
    excludeAllergens: z.array(z.string().min(1).max(60)).max(30).optional(),
    varietyWindowDays: z.number().int().min(0).max(30).optional(),
    ...targetFields,
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: 'endDate must be on or after startDate',
    path: ['endDate'],
  });

export const updatePlanSchema = z.object({
  name: z.string().min(1).max(180).optional(),
  description: z.string().max(2000).nullable().optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  headcount: z.number().int().min(1).max(1000000).optional(),
  budgetPerMeal: money.optional(),
  currency: z.string().length(3).optional(),
  pricingListId: z.string().uuid().nullable().optional(),
  sourceMenuId: z.string().uuid().nullable().optional(),
  slots: z.array(slotSpecSchema).min(1).max(10).optional(),
  excludeAllergens: z.array(z.string().min(1).max(60)).max(30).optional(),
  varietyWindowDays: z.number().int().min(0).max(30).optional(),
  ...targetFields,
});

export const generatePlanSchema = z.object({
  /** Locked items are kept; everything else is re-solved. */
  keepLockedItems: z.boolean().optional(),
});

export const previewPlanSchema = z
  .object({
    companyId: z.string().uuid(),
    startDate: isoDate,
    endDate: isoDate,
    headcount: z.number().int().min(1).max(1000000),
    budgetPerMeal: money,
    pricingListId: z.string().uuid().nullable().optional(),
    sourceMenuId: z.string().uuid().nullable().optional(),
    slots: z.array(slotSpecSchema).min(1).max(10),
    excludeAllergens: z.array(z.string().min(1).max(60)).max(30).optional(),
    varietyWindowDays: z.number().int().min(0).max(30).optional(),
    ...targetFields,
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: 'endDate must be on or after startDate',
    path: ['endDate'],
  });

export const addItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable().optional(),
  componentType: componentTypeSchema.optional(),
  quantity: z.number().int().min(1).max(50).optional(),
  isLocked: z.boolean().optional(),
});

export const updateItemSchema = z.object({
  quantity: z.number().int().min(1).max(50).optional(),
  isLocked: z.boolean().optional(),
});

export const candidatesQuerySchema = z.object({
  companyId: z.string().uuid(),
  sourceMenuId: z.string().uuid().optional(),
  pricingListId: z.string().uuid().optional(),
  componentType: componentTypeSchema.optional(),
});

// ── OpenAPI response shapes ───────────────────────────────────────────────────

export const planWarningSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    date: z.string().optional(),
    componentType: z.string().optional(),
  })
  .openapi('MealPlanWarning');

export const mealPlanItemSchema = z
  .object({
    id: z.string().uuid(),
    productId: z.string().uuid(),
    variantId: z.string().uuid().nullable(),
    productName: z.string().nullable(),
    componentType: z.string(),
    quantity: z.number().int(),
    unitPrice: z.string(),
    lineTotal: z.string(),
    caloriesKcal: z.string(),
    proteinG: z.string(),
    carbsG: z.string(),
    fatG: z.string(),
    isLocked: z.boolean(),
    sortOrder: z.number().int(),
  })
  .openapi('MealPlanItem');

export const mealPlanDaySchema = z
  .object({
    id: z.string().uuid(),
    planDate: z.string(),
    sortOrder: z.number().int(),
    costPerHead: z.string(),
    totalCost: z.string(),
    caloriesKcal: z.string(),
    proteinG: z.string(),
    carbsG: z.string(),
    fatG: z.string(),
    isFeasible: z.boolean(),
    warnings: z.array(planWarningSchema),
    items: z.array(mealPlanItemSchema),
  })
  .openapi('MealPlanDay');

export const mealPlanSchema = z
  .object({
    id: z.string().uuid(),
    companyId: z.string().uuid(),
    companyName: z.string().nullable(),
    name: z.string(),
    description: z.string().nullable(),
    status: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    headcount: z.number().int(),
    budgetPerMeal: z.string(),
    currency: z.string(),
    pricingListId: z.string().uuid().nullable(),
    sourceMenuId: z.string().uuid().nullable(),
    minCaloriesKcal: z.string().nullable(),
    maxCaloriesKcal: z.string().nullable(),
    minProteinG: z.string().nullable(),
    maxProteinG: z.string().nullable(),
    minCarbsG: z.string().nullable(),
    maxCarbsG: z.string().nullable(),
    maxFatG: z.string().nullable(),
    slots: z.array(slotSpecSchema),
    excludeAllergens: z.array(z.string()),
    varietyWindowDays: z.number().int(),
    generatedAt: z.string().nullable(),
    isFeasible: z.boolean(),
    warnings: z.array(planWarningSchema),
    totalCost: z.string(),
    avgCostPerMeal: z.string(),
    avgCaloriesKcal: z.string(),
    avgProteinG: z.string(),
    avgCarbsG: z.string(),
    avgFatG: z.string(),
    approvedAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('MealPlan');

export const mealPlanDetailSchema = mealPlanSchema
  .extend({ days: z.array(mealPlanDaySchema) })
  .openapi('MealPlanDetail');

/** Unsaved solver output: no database ids, unlike {@link mealPlanDetailSchema}. */
export const mealPlanPreviewSchema = z
  .object({
    isFeasible: z.boolean(),
    totalCost: z.number(),
    avgCostPerMeal: z.number(),
    avgCaloriesKcal: z.number(),
    avgProteinG: z.number(),
    avgCarbsG: z.number(),
    avgFatG: z.number(),
    warnings: z.array(planWarningSchema),
    days: z.array(
      z.object({
        date: z.string(),
        costPerHead: z.number(),
        totalCost: z.number(),
        caloriesKcal: z.number(),
        proteinG: z.number(),
        carbsG: z.number(),
        fatG: z.number(),
        isFeasible: z.boolean(),
        warnings: z.array(planWarningSchema),
        items: z.array(
          z.object({
            productId: z.string().uuid(),
            variantId: z.string().uuid().nullable(),
            name: z.string(),
            componentType: z.string(),
            quantity: z.number().int(),
            unitPrice: z.number(),
            lineTotal: z.number(),
            caloriesKcal: z.number(),
            proteinG: z.number(),
            carbsG: z.number(),
            fatG: z.number(),
            isLocked: z.boolean(),
          }),
        ),
      }),
    ),
  })
  .openapi('MealPlanPreview');

export const mealPlanCandidateSchema = z
  .object({
    productId: z.string().uuid(),
    name: z.string(),
    categoryId: z.string().uuid(),
    componentType: z.string(),
    unitPrice: z.string(),
    currency: z.string(),
    caloriesKcal: z.string(),
    proteinG: z.string(),
    carbsG: z.string(),
    fatG: z.string(),
    allergens: z.array(z.string()),
    proteinPerCurrencyUnit: z.string(),
  })
  .openapi('MealPlanCandidate');

const bearer = [{ dashboardBearerAuth: [] }];

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/meal-plans',
  tags: ['Meal Plans'],
  summary: 'List budget meal plans',
  security: bearer,
  request: { query: listPlansQuerySchema },
  responses: {
    200: {
      description: 'Meal plan list',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(z.array(mealPlanSchema)) },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/meal-plans',
  tags: ['Meal Plans'],
  summary: 'Create a budget meal plan brief',
  security: bearer,
  request: { body: { content: { 'application/json': { schema: createPlanSchema } } } },
  responses: {
    201: {
      description: 'Meal plan created',
      content: { 'application/json': { schema: SuccessEnvelopeSchema(mealPlanSchema) } },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/meal-plans/candidates',
  tags: ['Meal Plans'],
  summary: 'List priced products with nutrition data that the planner can pick from',
  security: bearer,
  request: { query: candidatesQuerySchema },
  responses: {
    200: {
      description: 'Candidate products',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(z.array(mealPlanCandidateSchema)) },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/meal-plans/preview',
  tags: ['Meal Plans'],
  summary: 'Solve a brief without persisting it',
  security: bearer,
  request: { body: { content: { 'application/json': { schema: previewPlanSchema } } } },
  responses: {
    200: {
      description: 'Solved plan preview',
      content: { 'application/json': { schema: SuccessEnvelopeSchema(mealPlanPreviewSchema) } },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/meal-plans/{id}',
  tags: ['Meal Plans'],
  summary: 'Get a meal plan with its days and items',
  security: bearer,
  request: { params: planIdParamsSchema },
  responses: {
    200: {
      description: 'Meal plan detail',
      content: { 'application/json': { schema: SuccessEnvelopeSchema(mealPlanDetailSchema) } },
    },
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/dashboard/meal-plans/{id}',
  tags: ['Meal Plans'],
  summary: 'Update a meal plan brief',
  security: bearer,
  request: {
    params: planIdParamsSchema,
    body: { content: { 'application/json': { schema: updatePlanSchema } } },
  },
  responses: {
    200: {
      description: 'Meal plan updated',
      content: { 'application/json': { schema: SuccessEnvelopeSchema(mealPlanSchema) } },
    },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/dashboard/meal-plans/{id}',
  tags: ['Meal Plans'],
  summary: 'Archive a meal plan',
  security: bearer,
  request: { params: planIdParamsSchema },
  responses: { 204: { description: 'Meal plan archived' } },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/meal-plans/{id}/generate',
  tags: ['Meal Plans'],
  summary: 'Solve the brief and replace the plan days',
  security: bearer,
  request: {
    params: planIdParamsSchema,
    body: { content: { 'application/json': { schema: generatePlanSchema } } },
  },
  responses: {
    200: {
      description: 'Plan generated',
      content: { 'application/json': { schema: SuccessEnvelopeSchema(mealPlanDetailSchema) } },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/meal-plans/{id}/approve',
  tags: ['Meal Plans'],
  summary: 'Approve a generated meal plan',
  security: bearer,
  request: { params: planIdParamsSchema },
  responses: {
    200: {
      description: 'Plan approved',
      content: { 'application/json': { schema: SuccessEnvelopeSchema(mealPlanSchema) } },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/meal-plans/{id}/duplicate',
  tags: ['Meal Plans'],
  summary: 'Copy a plan brief into a new draft',
  security: bearer,
  request: { params: planIdParamsSchema },
  responses: {
    201: {
      description: 'Plan duplicated',
      content: { 'application/json': { schema: SuccessEnvelopeSchema(mealPlanSchema) } },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/meal-plans/{id}/days/{dayId}/items',
  tags: ['Meal Plans'],
  summary: 'Add a product to a plan day',
  security: bearer,
  request: {
    params: dayIdParamsSchema,
    body: { content: { 'application/json': { schema: addItemSchema } } },
  },
  responses: {
    201: {
      description: 'Item added',
      content: { 'application/json': { schema: SuccessEnvelopeSchema(mealPlanDaySchema) } },
    },
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/dashboard/meal-plans/{id}/days/{dayId}/items/{itemId}',
  tags: ['Meal Plans'],
  summary: 'Change quantity or lock state of a plan item',
  security: bearer,
  request: {
    params: itemIdParamsSchema,
    body: { content: { 'application/json': { schema: updateItemSchema } } },
  },
  responses: {
    200: {
      description: 'Item updated',
      content: { 'application/json': { schema: SuccessEnvelopeSchema(mealPlanDaySchema) } },
    },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/dashboard/meal-plans/{id}/days/{dayId}/items/{itemId}',
  tags: ['Meal Plans'],
  summary: 'Remove a product from a plan day',
  security: bearer,
  request: { params: itemIdParamsSchema },
  responses: { 204: { description: 'Item removed' } },
});

// ── Company-facing (§31) ──────────────────────────────────────────────────────

export const swapItemSchema = z.object({ productId: z.string().uuid() });

export const confirmPlanSchema = z.object({
  fulfillmentType: z.enum(['delivery', 'pickup']),
  deliveryAddressId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
});

export const swapOptionSchema = z
  .object({
    productId: z.string().uuid(),
    name: z.string(),
    componentType: z.string(),
    unitPrice: z.string(),
    currency: z.string(),
    caloriesKcal: z.string(),
    proteinG: z.string(),
    carbsG: z.string(),
    fatG: z.string(),
    allergens: z.array(z.string()),
    isCurrent: z.boolean(),
    withinBudget: z.boolean(),
    resultingCostPerHead: z.string(),
    resultingProteinG: z.string(),
    resultingCarbsG: z.string(),
    resultingCaloriesKcal: z.string(),
    warnings: z.array(planWarningSchema),
  })
  .openapi('MealPlanSwapOption');

const companyBearer = [{ companyBearerAuth: [] }];

registry.registerPath({
  method: 'get',
  path: '/api/v1/company/meal-plans',
  tags: ['Meal Plans'],
  summary: 'List my company meal plans',
  security: companyBearer,
  responses: {
    200: {
      description: 'Meal plans released to this company',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(z.array(mealPlanSchema)) },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/company/meal-plans/{id}',
  tags: ['Meal Plans'],
  summary: 'Get one of my company meal plans',
  security: companyBearer,
  request: { params: planIdParamsSchema },
  responses: {
    200: {
      description: 'Meal plan detail',
      content: { 'application/json': { schema: SuccessEnvelopeSchema(mealPlanDetailSchema) } },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/company/meal-plans/{id}/days/{dayId}/items/{itemId}/options',
  tags: ['Meal Plans'],
  summary: 'List the swap options for a plan item',
  security: companyBearer,
  request: { params: itemIdParamsSchema },
  responses: {
    200: {
      description: 'Alternatives with the day totals each one would produce',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(z.array(swapOptionSchema)) },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/company/meal-plans/{id}/days/{dayId}/items/{itemId}/swap',
  tags: ['Meal Plans'],
  summary: 'Choose a different product for a plan item',
  security: companyBearer,
  request: {
    params: itemIdParamsSchema,
    body: { content: { 'application/json': { schema: swapItemSchema } } },
  },
  responses: {
    200: {
      description: 'Day after the swap',
      content: { 'application/json': { schema: SuccessEnvelopeSchema(mealPlanDaySchema) } },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/company/meal-plans/{id}/confirm',
  tags: ['Meal Plans'],
  summary: 'Confirm the plan and place the orders',
  security: companyBearer,
  request: {
    params: planIdParamsSchema,
    body: { content: { 'application/json': { schema: confirmPlanSchema } } },
  },
  responses: { 201: { description: 'Plan confirmed and orders created' } },
});
