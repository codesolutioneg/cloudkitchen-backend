import { Router } from 'express';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { validate } from '../../core/middleware/validate';
import {
  companyAuthMiddleware,
  dashboardAuthMiddleware,
} from '../../core/middleware/companyAuthMiddleware';
import { companyIdParamsSchema, settingsBodySchema } from './settings.schemas';
import * as controller from './settings.controller';

const router = Router();

router.get(
  '/company/settings',
  companyAuthMiddleware,
  asyncHandler(controller.getCompanySettings),
);
router.put(
  '/company/settings',
  companyAuthMiddleware,
  validate(settingsBodySchema),
  asyncHandler(controller.putCompanySettings),
);

router.get(
  '/dashboard/settings/global',
  dashboardAuthMiddleware,
  asyncHandler(controller.getGlobalSettings),
);
router.put(
  '/dashboard/settings/global',
  dashboardAuthMiddleware,
  validate(settingsBodySchema),
  asyncHandler(controller.putGlobalSettings),
);

router.get(
  '/dashboard/settings/company/:companyId',
  dashboardAuthMiddleware,
  validate(companyIdParamsSchema, 'params'),
  asyncHandler(controller.getCompanySettingsForDashboard),
);
router.put(
  '/dashboard/settings/company/:companyId',
  dashboardAuthMiddleware,
  validate(companyIdParamsSchema, 'params'),
  validate(settingsBodySchema),
  asyncHandler(controller.putCompanySettingsForDashboard),
);

export default router;
