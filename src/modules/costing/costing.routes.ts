import { Router } from 'express';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { validate } from '../../core/middleware/validate';
import { dashboardAuthMiddleware } from '../../core/middleware/companyAuthMiddleware';
import { requirePagePermission } from '../../core/middleware/requirePagePermission';
import {
  bulkPriceSchema,
  createIngredientSchema,
  createRecipeSchema,
  createSupplierSchema,
  idParamsSchema,
  listCostsQuerySchema,
  listIngredientsQuerySchema,
  manualCostSchema,
  recipeStatusSchema,
  replaceLinesSchema,
  updateIngredientSchema,
} from './costing.schemas';
import * as controller from './costing.controller';

const router = Router();
const auth = dashboardAuthMiddleware;
const canView = requirePagePermission('/dashboard/costing', 'view');
const canEdit = requirePagePermission('/dashboard/costing', 'edit');
const canDelete = requirePagePermission('/dashboard/costing', 'delete');

router.get('/dashboard/costing/suppliers', auth, canView, asyncHandler(controller.listSuppliers));
router.post(
  '/dashboard/costing/suppliers',
  auth,
  canEdit,
  validate(createSupplierSchema),
  asyncHandler(controller.createSupplier),
);

// Static segments before `/:id` so they are not captured as ids.
router.post(
  '/dashboard/costing/ingredients/bulk-price',
  auth,
  canEdit,
  validate(bulkPriceSchema),
  asyncHandler(controller.bulkUpdatePrices),
);
router.get(
  '/dashboard/costing/ingredients',
  auth,
  canView,
  validate(listIngredientsQuerySchema, 'query'),
  asyncHandler(controller.listIngredients),
);
router.post(
  '/dashboard/costing/ingredients',
  auth,
  canEdit,
  validate(createIngredientSchema),
  asyncHandler(controller.createIngredient),
);
router.get(
  '/dashboard/costing/ingredients/:id',
  auth,
  canView,
  validate(idParamsSchema, 'params'),
  asyncHandler(controller.getIngredient),
);
router.get(
  '/dashboard/costing/ingredients/:id/history',
  auth,
  canView,
  validate(idParamsSchema, 'params'),
  asyncHandler(controller.listPriceHistory),
);
router.patch(
  '/dashboard/costing/ingredients/:id',
  auth,
  canEdit,
  validate(idParamsSchema, 'params'),
  validate(updateIngredientSchema),
  asyncHandler(controller.updateIngredient),
);
router.delete(
  '/dashboard/costing/ingredients/:id',
  auth,
  canDelete,
  validate(idParamsSchema, 'params'),
  asyncHandler(controller.deleteIngredient),
);

router.get('/dashboard/costing/recipes', auth, canView, asyncHandler(controller.listRecipes));
router.post(
  '/dashboard/costing/recipes',
  auth,
  canEdit,
  validate(createRecipeSchema),
  asyncHandler(controller.createRecipe),
);
router.get(
  '/dashboard/costing/recipes/:id',
  auth,
  canView,
  validate(idParamsSchema, 'params'),
  asyncHandler(controller.getRecipe),
);
router.put(
  '/dashboard/costing/recipes/:id/lines',
  auth,
  canEdit,
  validate(idParamsSchema, 'params'),
  validate(replaceLinesSchema),
  asyncHandler(controller.replaceRecipeLines),
);
router.post(
  '/dashboard/costing/recipes/:id/status',
  auth,
  canEdit,
  validate(idParamsSchema, 'params'),
  validate(recipeStatusSchema),
  asyncHandler(controller.setRecipeStatus),
);

router.get('/dashboard/costing/summary', auth, canView, asyncHandler(controller.getCostingSummary));
router.post('/dashboard/costing/recost', auth, canEdit, asyncHandler(controller.recostAll));
router.get(
  '/dashboard/costing/products',
  auth,
  canView,
  validate(listCostsQuerySchema, 'query'),
  asyncHandler(controller.listProductCosts),
);
router.post(
  '/dashboard/costing/products/:id/manual-cost',
  auth,
  canEdit,
  validate(idParamsSchema, 'params'),
  validate(manualCostSchema),
  asyncHandler(controller.setManualCost),
);

export default router;
