import { Router } from 'express';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { validate } from '../../core/middleware/validate';
import { dashboardAuthMiddleware } from '../../core/middleware/companyAuthMiddleware';
import { requirePagePermission } from '../../core/middleware/requirePagePermission';
import {
  createStepActionSchema,
  createTransitionConditionSchema,
  createWorkflowSchema,
  createWorkflowStepSchema,
  createWorkflowInstanceSchema,
  createWorkflowTransitionSchema,
  idParamsSchema,
  listWorkflowInstancesQuerySchema,
  listWorkflowsQuerySchema,
  stepIdParamsSchema,
  transitionIdParamsSchema,
  transitionInstanceSchema,
  updateWorkflowSchema,
  updateWorkflowStepSchema,
  updateWorkflowTransitionSchema,
} from './workflows.schemas';
import * as controller from './workflows.controller';

const router = Router();
const dashAuth = dashboardAuthMiddleware;
const canView = requirePagePermission('/dashboard/workflows', 'view');
const canCreate = requirePagePermission('/dashboard/workflows', 'create');
const canEdit = requirePagePermission('/dashboard/workflows', 'edit');

router.get(
  '/dashboard/workflows',
  dashAuth,
  canView,
  validate(listWorkflowsQuerySchema, 'query'),
  asyncHandler(controller.listWorkflows),
);
router.post(
  '/dashboard/workflows',
  dashAuth,
  canCreate,
  validate(createWorkflowSchema),
  asyncHandler(controller.createWorkflow),
);
router.patch(
  '/dashboard/workflows/:id',
  dashAuth,
  canEdit,
  validate(idParamsSchema, 'params'),
  validate(updateWorkflowSchema),
  asyncHandler(controller.updateWorkflow),
);

router.get(
  '/dashboard/workflows/:id/steps',
  dashAuth,
  canView,
  validate(idParamsSchema, 'params'),
  asyncHandler(controller.listWorkflowSteps),
);
router.post(
  '/dashboard/workflows/:id/steps',
  dashAuth,
  canCreate,
  validate(idParamsSchema, 'params'),
  validate(createWorkflowStepSchema),
  asyncHandler(controller.createWorkflowStep),
);
router.patch(
  '/dashboard/workflows/:id/steps/:stepId',
  dashAuth,
  canEdit,
  validate(stepIdParamsSchema, 'params'),
  validate(updateWorkflowStepSchema),
  asyncHandler(controller.updateWorkflowStep),
);

router.get(
  '/dashboard/workflows/:id/transitions',
  dashAuth,
  canView,
  validate(idParamsSchema, 'params'),
  asyncHandler(controller.listWorkflowTransitions),
);
router.post(
  '/dashboard/workflows/:id/transitions',
  dashAuth,
  canCreate,
  validate(idParamsSchema, 'params'),
  validate(createWorkflowTransitionSchema),
  asyncHandler(controller.createWorkflowTransition),
);
router.patch(
  '/dashboard/workflows/:id/transitions/:transitionId',
  dashAuth,
  canEdit,
  validate(transitionIdParamsSchema, 'params'),
  validate(updateWorkflowTransitionSchema),
  asyncHandler(controller.updateWorkflowTransition),
);

router.post(
  '/dashboard/workflows/transitions/:id/conditions',
  dashAuth,
  canCreate,
  validate(idParamsSchema, 'params'),
  validate(createTransitionConditionSchema),
  asyncHandler(controller.createTransitionCondition),
);

router.post(
  '/dashboard/workflows/steps/:id/actions',
  dashAuth,
  canCreate,
  validate(idParamsSchema, 'params'),
  validate(createStepActionSchema),
  asyncHandler(controller.createStepAction),
);

router.get(
  '/dashboard/workflow-instances',
  dashAuth,
  canView,
  validate(listWorkflowInstancesQuerySchema, 'query'),
  asyncHandler(controller.listWorkflowInstances),
);
router.post(
  '/dashboard/workflow-instances',
  dashAuth,
  canCreate,
  validate(createWorkflowInstanceSchema),
  asyncHandler(controller.createWorkflowInstance),
);
router.post(
  '/dashboard/workflow-instances/:id/transition',
  dashAuth,
  canEdit,
  validate(idParamsSchema, 'params'),
  validate(transitionInstanceSchema),
  asyncHandler(controller.transitionWorkflowInstance),
);

export default router;
