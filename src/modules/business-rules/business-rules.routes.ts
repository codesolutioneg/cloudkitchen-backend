import { Router } from 'express';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { validate } from '../../core/middleware/validate';
import { dashboardAuthMiddleware } from '../../core/middleware/companyAuthMiddleware';
import { requirePagePermission } from '../../core/middleware/requirePagePermission';
import {
  calendarEventParamsSchema,
  createBusinessRuleSchema,
  createCalendarEventSchema,
  createCalendarSchema,
  createRuleTypeSchema,
  idParamsSchema,
  listBusinessRulesQuerySchema,
  listCalendarsQuerySchema,
  resolveBusinessRuleQuerySchema,
  updateBusinessRuleSchema,
  updateCalendarEventSchema,
  updateCalendarSchema,
  updateRuleTypeSchema,
} from './business-rules.schemas';
import * as controller from './business-rules.controller';

const router = Router();
const dashAuth = dashboardAuthMiddleware;
const canView = requirePagePermission('/dashboard/rules', 'view');
const canCreate = requirePagePermission('/dashboard/rules', 'create');
const canEdit = requirePagePermission('/dashboard/rules', 'edit');
const canDelete = requirePagePermission('/dashboard/rules', 'delete');

router.get(
  '/dashboard/rules/rule-types',
  dashAuth,
  canView,
  asyncHandler(controller.listRuleTypes),
);
router.post(
  '/dashboard/rules/rule-types',
  dashAuth,
  canCreate,
  validate(createRuleTypeSchema),
  asyncHandler(controller.createRuleType),
);
router.patch(
  '/dashboard/rules/rule-types/:id',
  dashAuth,
  canEdit,
  validate(idParamsSchema, 'params'),
  validate(updateRuleTypeSchema),
  asyncHandler(controller.updateRuleType),
);

router.get(
  '/dashboard/rules/business-rules/resolve',
  dashAuth,
  canView,
  validate(resolveBusinessRuleQuerySchema, 'query'),
  asyncHandler(controller.resolveBusinessRule),
);
router.get(
  '/dashboard/rules/business-rules',
  dashAuth,
  canView,
  validate(listBusinessRulesQuerySchema, 'query'),
  asyncHandler(controller.listBusinessRules),
);
router.post(
  '/dashboard/rules/business-rules',
  dashAuth,
  canCreate,
  validate(createBusinessRuleSchema),
  asyncHandler(controller.createBusinessRule),
);
router.patch(
  '/dashboard/rules/business-rules/:id',
  dashAuth,
  canEdit,
  validate(idParamsSchema, 'params'),
  validate(updateBusinessRuleSchema),
  asyncHandler(controller.updateBusinessRule),
);
router.delete(
  '/dashboard/rules/business-rules/:id',
  dashAuth,
  canDelete,
  validate(idParamsSchema, 'params'),
  asyncHandler(controller.deleteBusinessRule),
);

router.get(
  '/dashboard/rules/calendars',
  dashAuth,
  canView,
  validate(listCalendarsQuerySchema, 'query'),
  asyncHandler(controller.listCalendars),
);
router.post(
  '/dashboard/rules/calendars',
  dashAuth,
  canCreate,
  validate(createCalendarSchema),
  asyncHandler(controller.createCalendar),
);
router.patch(
  '/dashboard/rules/calendars/:id',
  dashAuth,
  canEdit,
  validate(idParamsSchema, 'params'),
  validate(updateCalendarSchema),
  asyncHandler(controller.updateCalendar),
);

router.get(
  '/dashboard/rules/calendars/:id/events',
  dashAuth,
  canView,
  validate(idParamsSchema, 'params'),
  asyncHandler(controller.listCalendarEvents),
);
router.post(
  '/dashboard/rules/calendars/:id/events',
  dashAuth,
  canCreate,
  validate(idParamsSchema, 'params'),
  validate(createCalendarEventSchema),
  asyncHandler(controller.createCalendarEvent),
);
router.patch(
  '/dashboard/rules/calendars/:id/events/:eventId',
  dashAuth,
  canEdit,
  validate(calendarEventParamsSchema, 'params'),
  validate(updateCalendarEventSchema),
  asyncHandler(controller.updateCalendarEvent),
);

export default router;
