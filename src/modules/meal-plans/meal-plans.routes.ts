import { Router } from 'express';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { validate } from '../../core/middleware/validate';
import {
  companyAuthMiddleware,
  dashboardAuthMiddleware,
} from '../../core/middleware/companyAuthMiddleware';
import { requirePagePermission } from '../../core/middleware/requirePagePermission';
import {
  addItemSchema,
  candidatesQuerySchema,
  createPlanSchema,
  dayIdParamsSchema,
  generatePlanSchema,
  itemIdParamsSchema,
  listPlansQuerySchema,
  confirmPlanSchema,
  planIdParamsSchema,
  previewPlanSchema,
  swapItemSchema,
  updateItemSchema,
  updatePlanSchema,
} from './meal-plans.schemas';
import * as controller from './meal-plans.controller';

const router = Router();
const auth = dashboardAuthMiddleware;
const canView = requirePagePermission('/dashboard/meal-plans', 'view');
const canCreate = requirePagePermission('/dashboard/meal-plans', 'create');
const canEdit = requirePagePermission('/dashboard/meal-plans', 'edit');
const canDelete = requirePagePermission('/dashboard/meal-plans', 'delete');
const canApprove = requirePagePermission('/dashboard/meal-plans', 'approve');

router.get(
  '/dashboard/meal-plans',
  auth,
  canView,
  validate(listPlansQuerySchema, 'query'),
  asyncHandler(controller.listPlans),
);
router.post(
  '/dashboard/meal-plans',
  auth,
  canCreate,
  validate(createPlanSchema),
  asyncHandler(controller.createPlan),
);

// Static segments are declared before `/:id` so they are not captured as ids.
router.get(
  '/dashboard/meal-plans/candidates',
  auth,
  canView,
  validate(candidatesQuerySchema, 'query'),
  asyncHandler(controller.listCandidates),
);
router.post(
  '/dashboard/meal-plans/preview',
  auth,
  canView,
  validate(previewPlanSchema),
  asyncHandler(controller.previewPlan),
);

router.get(
  '/dashboard/meal-plans/:id',
  auth,
  canView,
  validate(planIdParamsSchema, 'params'),
  asyncHandler(controller.getPlan),
);
router.patch(
  '/dashboard/meal-plans/:id',
  auth,
  canEdit,
  validate(planIdParamsSchema, 'params'),
  validate(updatePlanSchema),
  asyncHandler(controller.updatePlan),
);
router.delete(
  '/dashboard/meal-plans/:id',
  auth,
  canDelete,
  validate(planIdParamsSchema, 'params'),
  asyncHandler(controller.archivePlan),
);

router.post(
  '/dashboard/meal-plans/:id/generate',
  auth,
  canEdit,
  validate(planIdParamsSchema, 'params'),
  validate(generatePlanSchema),
  asyncHandler(controller.generatePlan),
);
router.post(
  '/dashboard/meal-plans/:id/approve',
  auth,
  canApprove,
  validate(planIdParamsSchema, 'params'),
  asyncHandler(controller.approvePlan),
);
router.post(
  '/dashboard/meal-plans/:id/duplicate',
  auth,
  canCreate,
  validate(planIdParamsSchema, 'params'),
  asyncHandler(controller.duplicatePlan),
);

router.post(
  '/dashboard/meal-plans/:id/days/:dayId/items',
  auth,
  canEdit,
  validate(dayIdParamsSchema, 'params'),
  validate(addItemSchema),
  asyncHandler(controller.addItem),
);
router.patch(
  '/dashboard/meal-plans/:id/days/:dayId/items/:itemId',
  auth,
  canEdit,
  validate(itemIdParamsSchema, 'params'),
  validate(updateItemSchema),
  asyncHandler(controller.updateItem),
);
router.delete(
  '/dashboard/meal-plans/:id/days/:dayId/items/:itemId',
  auth,
  canDelete,
  validate(itemIdParamsSchema, 'params'),
  asyncHandler(controller.removeItem),
);

// ── Company-facing: the client reviews, swaps and signs off ──────────────────
const companyAuth = companyAuthMiddleware;

router.get('/company/meal-plans', companyAuth, asyncHandler(controller.listCompanyPlans));
router.get(
  '/company/meal-plans/:id',
  companyAuth,
  validate(planIdParamsSchema, 'params'),
  asyncHandler(controller.getCompanyPlan),
);
router.get(
  '/company/meal-plans/:id/days/:dayId/items/:itemId/options',
  companyAuth,
  validate(itemIdParamsSchema, 'params'),
  asyncHandler(controller.listSwapOptions),
);
router.post(
  '/company/meal-plans/:id/days/:dayId/items/:itemId/swap',
  companyAuth,
  validate(itemIdParamsSchema, 'params'),
  validate(swapItemSchema),
  asyncHandler(controller.swapCompanyPlanItem),
);
router.post(
  '/company/meal-plans/:id/confirm',
  companyAuth,
  validate(planIdParamsSchema, 'params'),
  validate(confirmPlanSchema),
  asyncHandler(controller.confirmCompanyPlan),
);

export default router;
