import { Router } from 'express';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { validate } from '../../core/middleware/validate';
import {
  companyAuthMiddleware,
  dashboardAuthMiddleware,
} from '../../core/middleware/companyAuthMiddleware';
import { requirePagePermission } from '../../core/middleware/requirePagePermission';
import {
  createNotificationTemplateSchema,
  deviceTokenIdParamsSchema,
  listNotificationsQuerySchema,
  notificationIdParamsSchema,
  registerDeviceTokenSchema,
  templateIdParamsSchema,
  updateNotificationTemplateSchema,
} from './notifications.schemas';
import * as controller from './notifications.controller';

const router = Router();
const dashAuth = dashboardAuthMiddleware;
const canViewNotifications = requirePagePermission('/dashboard/notifications', 'view');
const canCreateNotifications = requirePagePermission('/dashboard/notifications', 'create');
const canEditNotifications = requirePagePermission('/dashboard/notifications', 'edit');

router.get(
  '/company/notifications',
  companyAuthMiddleware,
  validate(listNotificationsQuerySchema, 'query'),
  asyncHandler(controller.listNotifications),
);

router.post(
  '/company/notifications/:id/read',
  companyAuthMiddleware,
  validate(notificationIdParamsSchema, 'params'),
  asyncHandler(controller.markRead),
);

router.post(
  '/company/device-tokens',
  companyAuthMiddleware,
  validate(registerDeviceTokenSchema),
  asyncHandler(controller.registerDeviceToken),
);

router.delete(
  '/company/device-tokens/:id',
  companyAuthMiddleware,
  validate(deviceTokenIdParamsSchema, 'params'),
  asyncHandler(controller.removeDeviceToken),
);

router.get(
  '/dashboard/notification-templates',
  dashAuth,
  canViewNotifications,
  asyncHandler(controller.listTemplates),
);

router.post(
  '/dashboard/notification-templates',
  dashAuth,
  canCreateNotifications,
  validate(createNotificationTemplateSchema),
  asyncHandler(controller.createTemplate),
);

router.patch(
  '/dashboard/notification-templates/:id',
  dashAuth,
  canEditNotifications,
  validate(templateIdParamsSchema, 'params'),
  validate(updateNotificationTemplateSchema),
  asyncHandler(controller.updateTemplate),
);

export default router;
