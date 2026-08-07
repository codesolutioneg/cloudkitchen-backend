import { Router } from 'express';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { validate } from '../../core/middleware/validate';
import {
  companyAuthMiddleware,
  dashboardAuthMiddleware,
} from '../../core/middleware/companyAuthMiddleware';
import { requirePagePermission } from '../../core/middleware/requirePagePermission';
import { idParamsSchema } from '../orders/orders.schemas';
import * as receiptController from './receipt.controller';

const router = Router();

router.get(
  '/company/orders/:id/receipt',
  companyAuthMiddleware,
  validate(idParamsSchema, 'params'),
  asyncHandler(receiptController.downloadCompanyReceipt),
);

router.get(
  '/dashboard/orders/:id/receipt',
  dashboardAuthMiddleware,
  requirePagePermission('/dashboard/orders', 'view'),
  validate(idParamsSchema, 'params'),
  asyncHandler(receiptController.downloadDashboardReceipt),
);

export default router;
