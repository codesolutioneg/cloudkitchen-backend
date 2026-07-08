import { Router } from 'express';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { validate } from '../../core/middleware/validate';
import {
  companyAuthMiddleware,
  dashboardAuthMiddleware,
} from '../../core/middleware/companyAuthMiddleware';
import { requirePagePermission } from '../../core/middleware/requirePagePermission';
import {
  addDashboardOrderNoteSchema,
  addOrderNoteSchema,
  approvalLevelParamsSchema,
  cancelOrderSchema,
  createOrderSchema,
  decideOrderApprovalSchema,
  idParamsSchema,
  listDashboardOrdersQuerySchema,
  listOrdersQuerySchema,
  transitionOrderSchema,
} from './orders.schemas';
import * as controller from './orders.controller';

const router = Router();
const companyAuth = companyAuthMiddleware;
const dashAuth = dashboardAuthMiddleware;
const canViewOrders = requirePagePermission('/dashboard/orders', 'view');
const canEditOrders = requirePagePermission('/dashboard/orders', 'edit');
const canApproveOrders = requirePagePermission('/dashboard/orders', 'approve');

router.post(
  '/company/orders',
  companyAuth,
  validate(createOrderSchema),
  asyncHandler(controller.createOrder),
);
router.get(
  '/company/orders',
  companyAuth,
  validate(listOrdersQuerySchema, 'query'),
  asyncHandler(controller.listCompanyOrders),
);
router.get(
  '/company/orders/:id',
  companyAuth,
  validate(idParamsSchema, 'params'),
  asyncHandler(controller.getCompanyOrder),
);
router.post(
  '/company/orders/:id/cancel',
  companyAuth,
  validate(idParamsSchema, 'params'),
  validate(cancelOrderSchema),
  asyncHandler(controller.cancelCompanyOrder),
);
router.get(
  '/company/orders/:id/tracking',
  companyAuth,
  validate(idParamsSchema, 'params'),
  asyncHandler(controller.getOrderTracking),
);
router.post(
  '/company/orders/:id/notes',
  companyAuth,
  validate(idParamsSchema, 'params'),
  validate(addOrderNoteSchema),
  asyncHandler(controller.addCompanyOrderNote),
);
router.post(
  '/company/orders/:id/approvals/:level/decide',
  companyAuth,
  validate(approvalLevelParamsSchema, 'params'),
  validate(decideOrderApprovalSchema),
  asyncHandler(controller.decideCompanyOrderApproval),
);

router.get(
  '/dashboard/orders',
  dashAuth,
  canViewOrders,
  validate(listDashboardOrdersQuerySchema, 'query'),
  asyncHandler(controller.listDashboardOrders),
);
router.get(
  '/dashboard/orders/:id',
  dashAuth,
  canViewOrders,
  validate(idParamsSchema, 'params'),
  asyncHandler(controller.getDashboardOrder),
);
router.post(
  '/dashboard/orders/:id/transitions',
  dashAuth,
  canEditOrders,
  validate(idParamsSchema, 'params'),
  validate(transitionOrderSchema),
  asyncHandler(controller.transitionDashboardOrder),
);
router.post(
  '/dashboard/orders/:id/notes',
  dashAuth,
  canEditOrders,
  validate(idParamsSchema, 'params'),
  validate(addDashboardOrderNoteSchema),
  asyncHandler(controller.addDashboardOrderNote),
);
router.post(
  '/dashboard/orders/:id/approvals/:level/decide',
  dashAuth,
  canApproveOrders,
  validate(approvalLevelParamsSchema, 'params'),
  validate(decideOrderApprovalSchema),
  asyncHandler(controller.decideDashboardOrderApproval),
);

export default router;
