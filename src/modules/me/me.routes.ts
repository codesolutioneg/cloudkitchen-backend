import { Router } from 'express';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import {
  companyAuthMiddleware,
  dashboardAuthMiddleware,
} from '../../core/middleware/companyAuthMiddleware';
import * as controller from './me.controller';
import './me.schemas';

const router = Router();

router.get('/me/modules', companyAuthMiddleware, asyncHandler(controller.getCompanyModules));

router.get(
  '/me/navigation',
  dashboardAuthMiddleware,
  asyncHandler(controller.getDashboardNavigation),
);

export default router;
