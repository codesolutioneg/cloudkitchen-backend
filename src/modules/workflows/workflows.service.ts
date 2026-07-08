import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client';
import { NotFoundError } from '../../core/errors/AppError';
import { workflowEngine } from '../../engines/workflowEngine';

function serializeWorkflow(wf: {
  id: string;
  name: string;
  workflow_type: string;
  company_id: string | null;
  is_active: boolean;
}) {
  return {
    id: wf.id,
    name: wf.name,
    workflowType: wf.workflow_type,
    companyId: wf.company_id,
    isActive: wf.is_active,
  };
}

function serializeStep(step: {
  id: string;
  workflow_id: string;
  code: string;
  name: string;
  step_type: string;
  sla_minutes: number | null;
  sort_order: number;
}) {
  return {
    id: step.id,
    workflowId: step.workflow_id,
    code: step.code,
    name: step.name,
    stepType: step.step_type,
    slaMinutes: step.sla_minutes,
    sortOrder: step.sort_order,
  };
}

function serializeTransition(t: {
  id: string;
  workflow_id: string;
  from_step_id: string | null;
  to_step_id: string;
  trigger_type: string;
  required_permission_id: string | null;
}) {
  return {
    id: t.id,
    workflowId: t.workflow_id,
    fromStepId: t.from_step_id,
    toStepId: t.to_step_id,
    triggerType: t.trigger_type,
    requiredPermissionId: t.required_permission_id,
  };
}

// ── Workflows ─────────────────────────────────────────────────────────────────

export async function listWorkflows(query?: { workflowType?: string; companyId?: string }) {
  const where: Prisma.WorkflowWhereInput = {};
  if (query?.workflowType) {
    where.workflow_type = query.workflowType;
  }
  if (query?.companyId) {
    where.company_id = query.companyId;
  }

  const rows = await prisma.workflow.findMany({
    where,
    orderBy: { name: 'asc' },
  });
  return rows.map(serializeWorkflow);
}

export async function createWorkflow(input: {
  name: string;
  workflowType: string;
  companyId?: string;
  isActive?: boolean;
}) {
  const row = await prisma.workflow.create({
    data: {
      name: input.name,
      workflow_type: input.workflowType,
      company_id: input.companyId ?? null,
      is_active: input.isActive ?? true,
    },
  });
  return serializeWorkflow(row);
}

export async function updateWorkflow(
  id: string,
  input: { name?: string; isActive?: boolean },
) {
  const existing = await prisma.workflow.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError('Workflow not found');
  }
  const row = await prisma.workflow.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
    },
  });
  return serializeWorkflow(row);
}

// ── Steps ─────────────────────────────────────────────────────────────────────

export async function listWorkflowSteps(workflowId: string) {
  const wf = await prisma.workflow.findUnique({ where: { id: workflowId } });
  if (!wf) {
    throw new NotFoundError('Workflow not found');
  }
  const rows = await prisma.workflowStep.findMany({
    where: { workflow_id: workflowId },
    orderBy: { sort_order: 'asc' },
  });
  return rows.map(serializeStep);
}

export async function createWorkflowStep(
  workflowId: string,
  input: {
    code: string;
    name: string;
    stepType: 'initial' | 'intermediate' | 'final';
    slaMinutes?: number;
    sortOrder?: number;
  },
) {
  const wf = await prisma.workflow.findUnique({ where: { id: workflowId } });
  if (!wf) {
    throw new NotFoundError('Workflow not found');
  }
  const row = await prisma.workflowStep.create({
    data: {
      workflow_id: workflowId,
      code: input.code,
      name: input.name,
      step_type: input.stepType,
      sla_minutes: input.slaMinutes ?? null,
      sort_order: input.sortOrder ?? 0,
    },
  });
  return serializeStep(row);
}

export async function updateWorkflowStep(
  workflowId: string,
  stepId: string,
  input: {
    name?: string;
    stepType?: 'initial' | 'intermediate' | 'final';
    slaMinutes?: number | null;
    sortOrder?: number;
  },
) {
  const existing = await prisma.workflowStep.findFirst({
    where: { id: stepId, workflow_id: workflowId },
  });
  if (!existing) {
    throw new NotFoundError('Workflow step not found');
  }
  const row = await prisma.workflowStep.update({
    where: { id: stepId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.stepType !== undefined ? { step_type: input.stepType } : {}),
      ...(input.slaMinutes !== undefined ? { sla_minutes: input.slaMinutes } : {}),
      ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
    },
  });
  return serializeStep(row);
}

// ── Transitions ───────────────────────────────────────────────────────────────

export async function listWorkflowTransitions(workflowId: string) {
  const wf = await prisma.workflow.findUnique({ where: { id: workflowId } });
  if (!wf) {
    throw new NotFoundError('Workflow not found');
  }
  const rows = await prisma.workflowTransition.findMany({
    where: { workflow_id: workflowId },
  });
  return rows.map(serializeTransition);
}

export async function createWorkflowTransition(
  workflowId: string,
  input: {
    fromStepId?: string;
    toStepId: string;
    triggerType: 'manual' | 'automatic' | 'scheduled';
    requiredPermissionId?: string;
  },
) {
  const wf = await prisma.workflow.findUnique({ where: { id: workflowId } });
  if (!wf) {
    throw new NotFoundError('Workflow not found');
  }
  const row = await prisma.workflowTransition.create({
    data: {
      workflow_id: workflowId,
      from_step_id: input.fromStepId ?? null,
      to_step_id: input.toStepId,
      trigger_type: input.triggerType,
      required_permission_id: input.requiredPermissionId ?? null,
    },
  });
  return serializeTransition(row);
}

export async function updateWorkflowTransition(
  workflowId: string,
  transitionId: string,
  input: {
    fromStepId?: string | null;
    toStepId?: string;
    triggerType?: 'manual' | 'automatic' | 'scheduled';
    requiredPermissionId?: string | null;
  },
) {
  const existing = await prisma.workflowTransition.findFirst({
    where: { id: transitionId, workflow_id: workflowId },
  });
  if (!existing) {
    throw new NotFoundError('Workflow transition not found');
  }
  const row = await prisma.workflowTransition.update({
    where: { id: transitionId },
    data: {
      ...(input.fromStepId !== undefined ? { from_step_id: input.fromStepId } : {}),
      ...(input.toStepId !== undefined ? { to_step_id: input.toStepId } : {}),
      ...(input.triggerType !== undefined ? { trigger_type: input.triggerType } : {}),
      ...(input.requiredPermissionId !== undefined
        ? { required_permission_id: input.requiredPermissionId }
        : {}),
    },
  });
  return serializeTransition(row);
}

export async function createTransitionCondition(
  transitionId: string,
  input: { conditionExpression: Record<string, unknown> },
) {
  const transition = await prisma.workflowTransition.findUnique({
    where: { id: transitionId },
  });
  if (!transition) {
    throw new NotFoundError('Workflow transition not found');
  }
  const row = await prisma.workflowCondition.create({
    data: {
      workflow_transition_id: transitionId,
      condition_expression: input.conditionExpression,
    },
  });
  return {
    id: row.id,
    workflowTransitionId: row.workflow_transition_id,
    conditionExpression: row.condition_expression,
  };
}

export async function createStepAction(
  stepId: string,
  input: {
    actionType: 'notify' | 'webhook' | 'auto_transition' | 'escalate' | 'require_approval';
    actionConfig: Record<string, unknown>;
  },
) {
  const step = await prisma.workflowStep.findUnique({ where: { id: stepId } });
  if (!step) {
    throw new NotFoundError('Workflow step not found');
  }
  const row = await prisma.workflowAction.create({
    data: {
      workflow_step_id: stepId,
      action_type: input.actionType,
      action_config: input.actionConfig,
    },
  });
  return {
    id: row.id,
    workflowStepId: row.workflow_step_id,
    actionType: row.action_type,
    actionConfig: row.action_config,
  };
}

// ── Instances ─────────────────────────────────────────────────────────────────

export async function listWorkflowInstances(query: {
  entityType?: string;
  entityId?: string;
}) {
  const where: Prisma.EntityWorkflowInstanceWhereInput = {};
  if (query.entityType) {
    where.entity_type = query.entityType;
  }
  if (query.entityId) {
    where.entity_id = query.entityId;
  }

  const rows = await prisma.entityWorkflowInstance.findMany({
    where,
    include: {
      current_step: true,
      workflow: true,
    },
    orderBy: { entered_step_at: 'desc' },
  });

  return rows.map((instance) => ({
    id: instance.id,
    workflowId: instance.workflow_id,
    workflowName: instance.workflow.name,
    workflowType: instance.workflow.workflow_type,
    entityType: instance.entity_type,
    entityId: instance.entity_id,
    currentStepId: instance.current_step_id,
    currentStepCode: instance.current_step.code,
    currentStepName: instance.current_step.name,
    enteredStepAt: instance.entered_step_at.toISOString(),
    slaDueAt: instance.sla_due_at?.toISOString() ?? null,
  }));
}

export async function transitionWorkflowInstance(
  instanceId: string,
  input: {
    toStepId: string;
    comment?: string;
    context?: Record<string, unknown>;
  },
) {
  return workflowEngine.transition({
    instanceId,
    toStepId: input.toStepId,
    triggerType: 'manual',
    comment: input.comment,
    context: input.context,
  });
}

export async function createWorkflowInstance(input: {
  workflowType: string;
  entityType: string;
  entityId: string;
  companyId?: string;
}) {
  return workflowEngine.createInstance(input);
}
