import { prisma } from '../prisma/client';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../core/errors/AppError';
import { getRequestActor } from '../core/middleware/requestContext';
import { permissionResolver } from './permissionResolver';
import { workflowActionDispatcher } from './workflowActionDispatcher';

export interface CreateInstanceParams {
  workflowType: string;
  entityType: string;
  entityId: string;
  companyId?: string;
}

export interface TransitionParams {
  instanceId: string;
  toStepId: string;
  triggerType?: 'manual' | 'automatic' | 'scheduled';
  comment?: string;
  context?: Record<string, unknown>;
}

function evaluateConditions(
  conditions: Array<{ condition_expression: unknown }>,
  context: Record<string, unknown>,
): boolean {
  if (conditions.length === 0) {
    return true;
  }

  return conditions.every((c) => {
    const expr = c.condition_expression;
    if (!expr || typeof expr !== 'object' || Array.isArray(expr)) {
      return true;
    }
    return Object.entries(expr as Record<string, unknown>).every(
      ([key, expected]) => context[key] === expected,
    );
  });
}

export function computeSlaDueAt(enteredStepAt: Date, slaMinutes: number | null): Date | null {
  if (slaMinutes == null || slaMinutes <= 0) {
    return null;
  }
  return new Date(enteredStepAt.getTime() + slaMinutes * 60_000);
}

// TODO(Phase 12): SLA scan loop — background worker scans entity_workflow_instances
// where sla_due_at < now() and fires escalate workflow_actions.

export const workflowEngine = {
  async resolveWorkflowForEntity(
    workflowType: string,
    companyId?: string,
  ): Promise<{ id: string; name: string }> {
    if (companyId) {
      const companyWorkflow = await prisma.workflow.findFirst({
        where: {
          workflow_type: workflowType,
          company_id: companyId,
          is_active: true,
        },
        orderBy: { name: 'asc' },
      });
      if (companyWorkflow) {
        return { id: companyWorkflow.id, name: companyWorkflow.name };
      }
    }

    const globalWorkflow = await prisma.workflow.findFirst({
      where: {
        workflow_type: workflowType,
        company_id: null,
        is_active: true,
      },
      orderBy: { name: 'asc' },
    });

    if (!globalWorkflow) {
      throw new NotFoundError(`No active workflow template for type '${workflowType}'`);
    }

    return { id: globalWorkflow.id, name: globalWorkflow.name };
  },

  async createInstance(params: CreateInstanceParams) {
    const workflow = await this.resolveWorkflowForEntity(
      params.workflowType,
      params.companyId,
    );

    const initialStep = await prisma.workflowStep.findFirst({
      where: { workflow_id: workflow.id, step_type: 'initial' },
      orderBy: { sort_order: 'asc' },
    });

    if (!initialStep) {
      throw new BadRequestError(`Workflow '${workflow.name}' has no initial step`);
    }

    const enteredAt = new Date();
    const slaDueAt = computeSlaDueAt(enteredAt, initialStep.sla_minutes);
    const actor = getRequestActor();

    const instance = await prisma.$transaction(async (tx) => {
      const created = await tx.entityWorkflowInstance.create({
        data: {
          workflow_id: workflow.id,
          entity_type: params.entityType,
          entity_id: params.entityId,
          current_step_id: initialStep.id,
          entered_step_at: enteredAt,
          sla_due_at: slaDueAt,
        },
        include: {
          current_step: true,
          workflow: true,
        },
      });

      await tx.entityWorkflowHistory.create({
        data: {
          workflow_instance_id: created.id,
          from_step_id: null,
          to_step_id: initialStep.id,
          actor_type: actor?.type ?? 'system',
          actor_id: actor?.id ?? null,
        },
      });

      return created;
    });

    await workflowActionDispatcher.dispatchStepActions(initialStep.id, {
      instanceId: instance.id,
      workflowId: workflow.id,
      entityType: params.entityType,
      entityId: params.entityId,
    });

    return serializeInstance(instance);
  },

  async transition(params: TransitionParams) {
    const instance = await prisma.entityWorkflowInstance.findUnique({
      where: { id: params.instanceId },
      include: {
        current_step: true,
        workflow: true,
      },
    });

    if (!instance) {
      throw new NotFoundError('Workflow instance not found');
    }

    const triggerType = params.triggerType ?? 'manual';
    const context = params.context ?? {};

    const transitions = await prisma.workflowTransition.findMany({
      where: {
        workflow_id: instance.workflow_id,
        to_step_id: params.toStepId,
        OR: [
          { from_step_id: instance.current_step_id },
          { from_step_id: null },
        ],
        trigger_type: triggerType,
      },
      include: {
        conditions: true,
        required_permission: true,
      },
    });

    const validTransition = transitions.find((t) =>
      evaluateConditions(t.conditions, context),
    );

    if (!validTransition) {
      throw new BadRequestError(
        'Illegal workflow transition — no matching transition from current step',
      );
    }

    if (
      triggerType === 'manual' &&
      validTransition.required_permission_id &&
      validTransition.required_permission
    ) {
      const actor = getRequestActor();
      if (actor?.type !== 'dashboard_user') {
        throw new ForbiddenError('Dashboard authentication required for this transition');
      }
      const allowed = await permissionResolver.hasPermissionCode(
        actor.id,
        validTransition.required_permission.code,
      );
      if (!allowed) {
        throw new ForbiddenError(
          `Missing permission '${validTransition.required_permission.code}' for transition`,
        );
      }
    }

    const toStep = await prisma.workflowStep.findUnique({
      where: { id: params.toStepId },
    });
    if (!toStep) {
      throw new NotFoundError('Target workflow step not found');
    }

    const enteredAt = new Date();
    const slaDueAt = computeSlaDueAt(enteredAt, toStep.sla_minutes);
    const actor = getRequestActor();

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.entityWorkflowInstance.update({
        where: { id: params.instanceId },
        data: {
          current_step_id: params.toStepId,
          entered_step_at: enteredAt,
          sla_due_at: slaDueAt,
        },
        include: {
          current_step: true,
          workflow: true,
        },
      });

      await tx.entityWorkflowHistory.create({
        data: {
          workflow_instance_id: params.instanceId,
          from_step_id: instance.current_step_id,
          to_step_id: params.toStepId,
          actor_type: actor?.type ?? 'system',
          actor_id: actor?.id ?? null,
          comment: params.comment ?? null,
        },
      });

      return row;
    });

    await workflowActionDispatcher.dispatchStepActions(toStep.id, {
      instanceId: updated.id,
      workflowId: updated.workflow_id,
      entityType: updated.entity_type,
      entityId: updated.entity_id,
    });

    return serializeInstance(updated);
  },
};

function serializeInstance(instance: {
  id: string;
  workflow_id: string;
  entity_type: string;
  entity_id: string;
  current_step_id: string;
  entered_step_at: Date;
  sla_due_at: Date | null;
  workflow: { id: string; name: string; workflow_type: string };
  current_step: { id: string; code: string; name: string; step_type: string };
}) {
  return {
    id: instance.id,
    workflowId: instance.workflow_id,
    workflowName: instance.workflow.name,
    workflowType: instance.workflow.workflow_type,
    entityType: instance.entity_type,
    entityId: instance.entity_id,
    currentStepId: instance.current_step_id,
    currentStepCode: instance.current_step.code,
    currentStepName: instance.current_step.name,
    currentStepType: instance.current_step.step_type,
    enteredStepAt: instance.entered_step_at.toISOString(),
    slaDueAt: instance.sla_due_at?.toISOString() ?? null,
  };
}
