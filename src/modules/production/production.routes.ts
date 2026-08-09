import { Router } from 'express';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { validate } from '../../core/middleware/validate';
import { dashboardAuthMiddleware } from '../../core/middleware/companyAuthMiddleware';
import { requirePagePermission } from '../../core/middleware/requirePagePermission';
import {
  dateParamsSchema,
  idParamsSchema,
  listPlansQuerySchema,
  lockDaySchema,
  planStatusSchema,
} from './production.schemas';
import * as controller from './production.controller';

const router = Router();
const auth = dashboardAuthMiddleware;
const canView = requirePagePermission('/dashboard/production', 'view');
const canEdit = requirePagePermission('/dashboard/production', 'edit');

// Static segments before `/:id` so they are not captured as ids.
router.get(
  '/dashboard/production/plans',
  auth,
  canView,
  validate(listPlansQuerySchema, 'query'),
  asyncHandler(controller.listPlans),
);
router.post(
  '/dashboard/production/plans',
  auth,
  canEdit,
  validate(lockDaySchema),
  asyncHandler(controller.lockDay),
);
router.get(
  '/dashboard/production/plans/:id',
  auth,
  canView,
  validate(idParamsSchema, 'params'),
  asyncHandler(controller.getPlan),
);
router.post(
  '/dashboard/production/plans/:id/status',
  auth,
  canEdit,
  validate(idParamsSchema, 'params'),
  validate(planStatusSchema),
  asyncHandler(controller.setPlanStatus),
);

router.get(
  '/dashboard/production/day/:date',
  auth,
  canView,
  validate(dateParamsSchema, 'params'),
  asyncHandler(controller.getDayPlan),
);
router.get(
  '/dashboard/production/day/:date/by-company',
  auth,
  canView,
  validate(dateParamsSchema, 'params'),
  asyncHandler(controller.getDayByCompany),
);

export default router;
