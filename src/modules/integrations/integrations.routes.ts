import { Router } from 'express';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { validate } from '../../core/middleware/validate';
import { dashboardAuthMiddleware } from '../../core/middleware/companyAuthMiddleware';
import { requirePagePermission } from '../../core/middleware/requirePagePermission';
import {
  createExternalSystemSchema,
  listIntegrationEventsQuerySchema,
  systemIdParamsSchema,
  updateExternalSystemSchema,
} from './integrations.schemas';
import * as controller from './integrations.controller';

const router = Router();
const dashAuth = dashboardAuthMiddleware;
const canViewIntegrations = requirePagePermission('/dashboard/integrations', 'view');
const canCreateIntegrations = requirePagePermission('/dashboard/integrations', 'create');
const canEditIntegrations = requirePagePermission('/dashboard/integrations', 'edit');

router.get(
  '/dashboard/integrations/systems',
  dashAuth,
  canViewIntegrations,
  asyncHandler(controller.listSystems),
);

router.post(
  '/dashboard/integrations/systems',
  dashAuth,
  canCreateIntegrations,
  validate(createExternalSystemSchema),
  asyncHandler(controller.createSystem),
);

router.patch(
  '/dashboard/integrations/systems/:id',
  dashAuth,
  canEditIntegrations,
  validate(systemIdParamsSchema, 'params'),
  validate(updateExternalSystemSchema),
  asyncHandler(controller.updateSystem),
);

router.get(
  '/dashboard/integrations/systems/:id/mappings',
  dashAuth,
  canViewIntegrations,
  validate(systemIdParamsSchema, 'params'),
  asyncHandler(controller.listMappings),
);

router.get(
  '/dashboard/integrations/events',
  dashAuth,
  canViewIntegrations,
  validate(listIntegrationEventsQuerySchema, 'query'),
  asyncHandler(controller.listEvents),
);

export default router;
