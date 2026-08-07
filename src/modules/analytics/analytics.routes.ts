import { Router } from 'express';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { validate } from '../../core/middleware/validate';
import { dashboardAuthMiddleware } from '../../core/middleware/companyAuthMiddleware';
import { requirePagePermission } from '../../core/middleware/requirePagePermission';
import { analyticsQuerySchema } from './analytics.schemas';
import * as controller from './analytics.controller';

const router = Router();
const dashAuth = dashboardAuthMiddleware;
const canViewDashboard = requirePagePermission('/dashboard', 'view');

router.get(
  '/dashboard/analytics/overview',
  dashAuth,
  canViewDashboard,
  validate(analyticsQuerySchema, 'query'),
  asyncHandler(controller.getOverview),
);

export default router;
