import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry, SuccessEnvelopeSchema } from '../../core/openapi/registry';

extendZodWithOpenApi(z);

export const idParamsSchema = z.object({ id: z.string().uuid() });
export const stepIdParamsSchema = z.object({
  id: z.string().uuid(),
  stepId: z.string().uuid(),
});

export const listApprovalWorkflowsQuerySchema = z.object({
  entityType: z.string().optional(),
  companyId: z.string().uuid().optional(),
});

export const createApprovalWorkflowSchema = z.object({
  name: z.string().min(1).max(150),
  entityType: z.string().min(1).max(50),
  companyId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
});

export const updateApprovalWorkflowSchema = createApprovalWorkflowSchema
  .omit({ entityType: true, companyId: true })
  .partial();

export const createApprovalWorkflowStepSchema = z.object({
  stepOrder: z.number().int().positive(),
  name: z.string().min(1).max(150),
  approverType: z.enum(['role', 'dashboard_user', 'dynamic_rule']),
  approverRoleId: z.string().uuid().optional(),
  approverDashboardUserId: z.string().uuid().optional(),
  approvalRuleId: z.string().uuid().optional(),
  requiredApprovalCount: z.number().int().positive().optional(),
  isRequired: z.boolean().optional(),
});

export const updateApprovalWorkflowStepSchema = createApprovalWorkflowStepSchema.partial();

export const listApprovalRequestsQuerySchema = z.object({
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

export const decideApprovalRequestSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  comment: z.string().optional(),
});

const approvalWorkflowSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    entityType: z.string(),
    companyId: z.string().uuid().nullable(),
    isActive: z.boolean(),
  })
  .openapi('ApprovalWorkflow');

const approvalWorkflowStepSchema = z
  .object({
    id: z.string().uuid(),
    approvalWorkflowId: z.string().uuid(),
    stepOrder: z.number().int(),
    name: z.string(),
    approverType: z.string(),
    requiredApprovalCount: z.number().int(),
  })
  .openapi('ApprovalWorkflowStep');

const approvalRequestSchema = z
  .object({
    id: z.string().uuid(),
    entityType: z.string(),
    entityId: z.string().uuid(),
    status: z.string(),
    currentStepOrder: z.number().int(),
  })
  .openapi('ApprovalRequest');

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/approval-workflows',
  tags: ['Approval Workflows'],
  summary: 'List approval workflows',
  security: [{ dashboardBearerAuth: [] }],
  request: { query: listApprovalWorkflowsQuerySchema },
  responses: {
    200: {
      description: 'Approval workflow list',
      content: {
        'application/json': {
          schema: SuccessEnvelopeSchema(z.array(approvalWorkflowSchema)),
        },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/approval-workflows',
  tags: ['Approval Workflows'],
  summary: 'Create approval workflow',
  security: [{ dashboardBearerAuth: [] }],
  request: {
    body: { content: { 'application/json': { schema: createApprovalWorkflowSchema } } },
  },
  responses: { 201: { description: 'Approval workflow created' } },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/dashboard/approval-workflows/{id}',
  tags: ['Approval Workflows'],
  summary: 'Update approval workflow',
  security: [{ dashboardBearerAuth: [] }],
  request: {
    params: idParamsSchema,
    body: { content: { 'application/json': { schema: updateApprovalWorkflowSchema } } },
  },
  responses: { 200: { description: 'Approval workflow updated' } },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/approval-workflows/{id}/steps',
  tags: ['Approval Workflows'],
  summary: 'List approval workflow steps',
  security: [{ dashboardBearerAuth: [] }],
  request: { params: idParamsSchema },
  responses: {
    200: {
      description: 'Step list',
      content: {
        'application/json': {
          schema: SuccessEnvelopeSchema(z.array(approvalWorkflowStepSchema)),
        },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/approval-workflows/{id}/steps',
  tags: ['Approval Workflows'],
  summary: 'Create approval workflow step',
  security: [{ dashboardBearerAuth: [] }],
  request: {
    params: idParamsSchema,
    body: { content: { 'application/json': { schema: createApprovalWorkflowStepSchema } } },
  },
  responses: { 201: { description: 'Step created' } },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/dashboard/approval-workflows/{id}/steps/{stepId}',
  tags: ['Approval Workflows'],
  summary: 'Update approval workflow step',
  security: [{ dashboardBearerAuth: [] }],
  request: {
    params: stepIdParamsSchema,
    body: { content: { 'application/json': { schema: updateApprovalWorkflowStepSchema } } },
  },
  responses: { 200: { description: 'Step updated' } },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/approval-requests',
  tags: ['Approval Workflows'],
  summary: 'List approval requests',
  security: [{ dashboardBearerAuth: [] }],
  request: { query: listApprovalRequestsQuerySchema },
  responses: {
    200: {
      description: 'Approval request list',
      content: {
        'application/json': {
          schema: SuccessEnvelopeSchema(z.array(approvalRequestSchema)),
        },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/approval-requests/{id}',
  tags: ['Approval Workflows'],
  summary: 'Get approval request detail',
  security: [{ dashboardBearerAuth: [] }],
  request: { params: idParamsSchema },
  responses: { 200: { description: 'Approval request detail' } },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/approval-requests/{id}/decide',
  tags: ['Approval Workflows'],
  summary: 'Decide on an approval request',
  security: [{ dashboardBearerAuth: [] }],
  request: {
    params: idParamsSchema,
    body: { content: { 'application/json': { schema: decideApprovalRequestSchema } } },
  },
  responses: { 200: { description: 'Decision recorded' } },
});
