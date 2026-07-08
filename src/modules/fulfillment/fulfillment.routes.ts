import { Router } from 'express';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { validate } from '../../core/middleware/validate';
import {
  companyAuthMiddleware,
  dashboardAuthMiddleware,
} from '../../core/middleware/companyAuthMiddleware';
import { requirePagePermission } from '../../core/middleware/requirePagePermission';
import {
  assignDeliverySchema,
  confirmDeliveryQrSchema,
  idParamsSchema,
} from './fulfillment.schemas';
import * as controller from './fulfillment.controller';

const router = Router();
const companyAuth = companyAuthMiddleware;
const dashAuth = dashboardAuthMiddleware;
const canViewDelivery = requirePagePermission('/dashboard/delivery', 'view');
const canEditDelivery = requirePagePermission('/dashboard/delivery', 'edit');

router.get(
  '/company/orders/:id/fulfillment-qr',
  companyAuth,
  validate(idParamsSchema, 'params'),
  asyncHandler(controller.getCompanyFulfillmentQr),
);

router.get(
  '/dashboard/delivery/orders',
  dashAuth,
  canViewDelivery,
  asyncHandler(controller.listMyDeliveryOrders),
);

router.get(
  '/dashboard/delivery/users',
  dashAuth,
  asyncHandler(controller.listAssignableDeliveryUsers),
);

router.post(
  '/dashboard/orders/:id/assign-delivery',
  dashAuth,
  validate(idParamsSchema, 'params'),
  validate(assignDeliverySchema),
  asyncHandler(controller.assignDeliveryUser),
);

router.post(
  '/dashboard/delivery/orders/:id/depart',
  dashAuth,
  canEditDelivery,
  validate(idParamsSchema, 'params'),
  asyncHandler(controller.departForDelivery),
);

router.post(
  '/dashboard/delivery/orders/:id/confirm-delivery',
  dashAuth,
  canEditDelivery,
  validate(idParamsSchema, 'params'),
  validate(confirmDeliveryQrSchema),
  asyncHandler(controller.confirmDeliveryByQr),
);

router.post(
  '/dashboard/orders/:id/awaiting-pickup',
  dashAuth,
  validate(idParamsSchema, 'params'),
  asyncHandler(controller.markAwaitingPickup),
);

router.post(
  '/dashboard/orders/:id/confirm-pickup',
  dashAuth,
  validate(idParamsSchema, 'params'),
  asyncHandler(controller.confirmPickup),
);

export default router;
