import { Router } from 'express';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { validate } from '../../core/middleware/validate';
import { dashboardAuthMiddleware } from '../../core/middleware/companyAuthMiddleware';
import { requirePagePermission } from '../../core/middleware/requirePagePermission';
import {
  createApprovalWorkflowSchema,
  createApprovalWorkflowStepSchema,
  decideApprovalRequestSchema,
  idParamsSchema,
  listApprovalRequestsQuerySchema,
  listApprovalWorkflowsQuerySchema,
  stepIdParamsSchema,
  updateApprovalWorkflowSchema,
  updateApprovalWorkflowStepSchema,
} from './approval-workflows.schemas';
import * as controller from './approval-workflows.controller';

const router = Router();
const dashAuth = dashboardAuthMiddleware;
const canView = requirePagePermission('/dashboard/approval-workflows', 'view');
const canCreate = requirePagePermission('/dashboard/approval-workflows', 'create');
const canEdit = requirePagePermission('/dashboard/approval-workflows', 'edit');
const canApprove = requirePagePermission('/dashboard/approval-workflows', 'approve');

router.get(
  '/dashboard/approval-workflows',
  dashAuth,
  canView,
  validate(listApprovalWorkflowsQuerySchema, 'query'),
  asyncHandler(controller.listApprovalWorkflows),
);
router.post(
  '/dashboard/approval-workflows',
  dashAuth,
  canCreate,
  validate(createApprovalWorkflowSchema),
  asyncHandler(controller.createApprovalWorkflow),
);
router.patch(
  '/dashboard/approval-workflows/:id',
  dashAuth,
  canEdit,
  validate(idParamsSchema, 'params'),
  validate(updateApprovalWorkflowSchema),
  asyncHandler(controller.updateApprovalWorkflow),
);

router.get(
  '/dashboard/approval-workflows/:id/steps',
  dashAuth,
  canView,
  validate(idParamsSchema, 'params'),
  asyncHandler(controller.listApprovalWorkflowSteps),
);
router.post(
  '/dashboard/approval-workflows/:id/steps',
  dashAuth,
  canCreate,
  validate(idParamsSchema, 'params'),
  validate(createApprovalWorkflowStepSchema),
  asyncHandler(controller.createApprovalWorkflowStep),
);
router.patch(
  '/dashboard/approval-workflows/:id/steps/:stepId',
  dashAuth,
  canEdit,
  validate(stepIdParamsSchema, 'params'),
  validate(updateApprovalWorkflowStepSchema),
  asyncHandler(controller.updateApprovalWorkflowStep),
);

router.get(
  '/dashboard/approval-requests',
  dashAuth,
  canView,
  validate(listApprovalRequestsQuerySchema, 'query'),
  asyncHandler(controller.listApprovalRequests),
);
router.get(
  '/dashboard/approval-requests/:id',
  dashAuth,
  canView,
  validate(idParamsSchema, 'params'),
  asyncHandler(controller.getApprovalRequest),
);
router.post(
  '/dashboard/approval-requests/:id/decide',
  dashAuth,
  canApprove,
  validate(idParamsSchema, 'params'),
  validate(decideApprovalRequestSchema),
  asyncHandler(controller.decideApprovalRequest),
);

export default router;
