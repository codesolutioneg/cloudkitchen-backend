import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry, SuccessEnvelopeSchema } from '../../core/openapi/registry';

extendZodWithOpenApi(z);

export const idParamsSchema = z.object({ id: z.string().uuid() });
export const stepIdParamsSchema = z.object({
  id: z.string().uuid(),
  stepId: z.string().uuid(),
});
export const transitionIdParamsSchema = z.object({
  id: z.string().uuid(),
  transitionId: z.string().uuid(),
});

export const workflowSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    workflowType: z.string(),
    companyId: z.string().uuid().nullable(),
    isActive: z.boolean(),
  })
  .openapi('Workflow');

export const createWorkflowSchema = z.object({
  name: z.string().min(1).max(150),
  workflowType: z.string().min(1).max(30),
  companyId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
});

export const updateWorkflowSchema = createWorkflowSchema
  .omit({ workflowType: true, companyId: true })
  .partial();

export const listWorkflowsQuerySchema = z.object({
  workflowType: z.string().optional(),
  companyId: z.string().uuid().optional(),
});

export const createWorkflowStepSchema = z.object({
  code: z.string().min(1).max(100),
  name: z.string().min(1).max(150),
  stepType: z.enum(['initial', 'intermediate', 'final']),
  slaMinutes: z.number().int().positive().optional(),
  sortOrder: z.number().int().optional(),
});

export const updateWorkflowStepSchema = createWorkflowStepSchema
  .omit({ code: true })
  .partial()
  .extend({
    slaMinutes: z.number().int().positive().nullable().optional(),
  });

export const createWorkflowTransitionSchema = z.object({
  fromStepId: z.string().uuid().optional(),
  toStepId: z.string().uuid(),
  triggerType: z.enum(['manual', 'automatic', 'scheduled']),
  requiredPermissionId: z.string().uuid().optional(),
});

export const updateWorkflowTransitionSchema = createWorkflowTransitionSchema.partial().extend({
  fromStepId: z.string().uuid().nullable().optional(),
  requiredPermissionId: z.string().uuid().nullable().optional(),
});

export const createTransitionConditionSchema = z.object({
  conditionExpression: z.record(z.unknown()),
});

export const createStepActionSchema = z.object({
  actionType: z.enum(['notify', 'webhook', 'auto_transition', 'escalate', 'require_approval']),
  actionConfig: z.record(z.unknown()),
});

export const listWorkflowInstancesQuerySchema = z.object({
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
});

export const transitionInstanceSchema = z.object({
  toStepId: z.string().uuid(),
  comment: z.string().optional(),
  context: z.record(z.unknown()).optional(),
});

export const createWorkflowInstanceSchema = z.object({
  workflowType: z.string().min(1).max(30),
  entityType: z.string().min(1).max(50),
  entityId: z.string().uuid(),
  companyId: z.string().uuid().optional(),
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/workflows',
  tags: ['Workflows'],
  summary: 'List workflow templates',
  security: [{ dashboardBearerAuth: [] }],
  request: { query: listWorkflowsQuerySchema },
  responses: {
    200: {
      description: 'Workflow list',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(z.array(workflowSchema)) },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/workflow-instances',
  tags: ['Workflows'],
  summary: 'Create a workflow instance for an entity',
  security: [{ dashboardBearerAuth: [] }],
  request: {
    body: { content: { 'application/json': { schema: createWorkflowInstanceSchema } } },
  },
  responses: { 201: { description: 'Created workflow instance' } },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/workflow-instances/{id}/transition',
  tags: ['Workflows'],
  summary: 'Manually transition a workflow instance',
  security: [{ dashboardBearerAuth: [] }],
  request: {
    params: idParamsSchema,
    body: { content: { 'application/json': { schema: transitionInstanceSchema } } },
  },
  responses: { 200: { description: 'Transitioned instance' } },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/workflow-instances',
  tags: ['Workflows'],
  summary: 'List workflow instances',
  security: [{ dashboardBearerAuth: [] }],
  request: { query: listWorkflowInstancesQuerySchema },
  responses: { 200: { description: 'Workflow instance list' } },
});
