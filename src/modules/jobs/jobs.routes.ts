import { Router } from 'express';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { validate } from '../../core/middleware/validate';
import { dashboardAuthMiddleware } from '../../core/middleware/companyAuthMiddleware';
import { requirePagePermission } from '../../core/middleware/requirePagePermission';
import { jobIdParamsSchema, listJobsQuerySchema } from './jobs.schemas';
import * as controller from './jobs.controller';

const router = Router();
const dashAuth = dashboardAuthMiddleware;
const canViewJobs = requirePagePermission('/dashboard/jobs', 'view');
const canEditJobs = requirePagePermission('/dashboard/jobs', 'edit');

router.get(
  '/dashboard/jobs',
  dashAuth,
  canViewJobs,
  validate(listJobsQuerySchema, 'query'),
  asyncHandler(controller.listJobs),
);

router.get(
  '/dashboard/jobs/:id',
  dashAuth,
  canViewJobs,
  validate(jobIdParamsSchema, 'params'),
  asyncHandler(controller.getJob),
);

router.post(
  '/dashboard/jobs/:id/retry',
  dashAuth,
  canEditJobs,
  validate(jobIdParamsSchema, 'params'),
  asyncHandler(controller.retryJob),
);

router.post(
  '/dashboard/jobs/:id/cancel',
  dashAuth,
  canEditJobs,
  validate(jobIdParamsSchema, 'params'),
  asyncHandler(controller.cancelJob),
);

export default router;
