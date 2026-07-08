import { Router } from 'express';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { validate } from '../../core/middleware/validate';
import { dashboardAuthMiddleware } from '../../core/middleware/companyAuthMiddleware';
import { requirePagePermission } from '../../core/middleware/requirePagePermission';
import { listAuditLogsQuerySchema } from './audit.schemas';
import * as controller from './audit.controller';

const router = Router();
const dashAuth = dashboardAuthMiddleware;
const canView = requirePagePermission('/dashboard/audit-logs', 'view');

router.get(
  '/dashboard/audit-logs',
  dashAuth,
  canView,
  validate(listAuditLogsQuerySchema, 'query'),
  asyncHandler(controller.listAuditLogs),
);

export default router;
