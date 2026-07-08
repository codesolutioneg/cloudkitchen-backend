import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../core/errors/AppError';
import { getRequestActor } from '../core/middleware/requestContext';
import { businessRuleResolver } from './businessRuleResolver';

export interface CreateApprovalRequestParams {
  approvalWorkflowId?: string;
  entityType: string;
  entityId: string;
  requestedBy: { type: string; id: string };
}

export interface DecideApprovalParams {
  requestId: string;
  decision: 'approved' | 'rejected';
  comment?: string;
}

async function loadWorkflowSteps(approvalWorkflowId: string) {
  return prisma.approvalWorkflowStep.findMany({
    where: { approval_workflow_id: approvalWorkflowId },
    orderBy: { step_order: 'asc' },
  });
}

async function userHasRole(dashboardUserId: string, roleId: string): Promise<boolean> {
  const assignment = await prisma.dashboardUserRole.findFirst({
    where: { dashboard_user_id: dashboardUserId, role_id: roleId },
  });
  return assignment !== null;
}

function serializeRequest(
  request: {
    id: string;
    approval_workflow_id: string;
    entity_type: string;
    entity_id: string;
    status: string;
    current_step_order: number;
    requested_by_type: string;
    requested_by_id: string;
    requested_at: Date;
    completed_at: Date | null;
  },
  steps?: Array<{
    id: string;
    step_order: number;
    name: string;
    approver_type: string;
    required_approval_count: number;
  }>,
) {
  return {
    id: request.id,
    approvalWorkflowId: request.approval_workflow_id,
    entityType: request.entity_type,
    entityId: request.entity_id,
    status: request.status,
    currentStepOrder: request.current_step_order,
    requestedByType: request.requested_by_type,
    requestedById: request.requested_by_id,
    requestedAt: request.requested_at.toISOString(),
    completedAt: request.completed_at?.toISOString() ?? null,
    steps: steps?.map((s) => ({
      id: s.id,
      stepOrder: s.step_order,
      name: s.name,
      approverType: s.approver_type,
      requiredApprovalCount: s.required_approval_count,
    })),
  };
}

export const approvalEngine = {
  async resolveApprovalWorkflow(entityType: string, companyId?: string) {
    if (companyId) {
      const companyWorkflow = await prisma.approvalWorkflow.findFirst({
        where: {
          entity_type: entityType,
          company_id: companyId,
          is_active: true,
        },
        orderBy: { name: 'asc' },
      });
      if (companyWorkflow) {
        return companyWorkflow;
      }
    }

    const globalWorkflow = await prisma.approvalWorkflow.findFirst({
      where: {
        entity_type: entityType,
        company_id: null,
        is_active: true,
      },
      orderBy: { name: 'asc' },
    });

    if (!globalWorkflow) {
      throw new NotFoundError(`No active approval workflow for entity type '${entityType}'`);
    }

    return globalWorkflow;
  },

  async createRequest(params: CreateApprovalRequestParams) {
    const workflow = params.approvalWorkflowId
      ? await prisma.approvalWorkflow.findUnique({ where: { id: params.approvalWorkflowId } })
      : await this.resolveApprovalWorkflow(params.entityType);

    if (!workflow || !workflow.is_active) {
      throw new NotFoundError('Approval workflow not found');
    }

    const steps = await loadWorkflowSteps(workflow.id);
    if (steps.length === 0) {
      throw new BadRequestError('Approval workflow has no steps');
    }

    const request = await prisma.approvalRequest.create({
      data: {
        approval_workflow_id: workflow.id,
        entity_type: params.entityType,
        entity_id: params.entityId,
        status: 'pending',
        current_step_order: steps[0]!.step_order,
        requested_by_type: params.requestedBy.type,
        requested_by_id: params.requestedBy.id,
      },
    });

    return serializeRequest(request, steps);
  },

  async canUserDecide(requestId: string, dashboardUserId: string): Promise<boolean> {
    const request = await prisma.approvalRequest.findUnique({
      where: { id: requestId },
    });
    if (!request || request.status !== 'pending') {
      return false;
    }

    const step = await prisma.approvalWorkflowStep.findFirst({
      where: {
        approval_workflow_id: request.approval_workflow_id,
        step_order: request.current_step_order,
      },
    });
    if (!step) {
      return false;
    }

    const existingDecision = await prisma.approvalDecision.findFirst({
      where: {
        approval_request_id: requestId,
        step_order: request.current_step_order,
        decided_by_type: 'dashboard_user',
        decided_by_id: dashboardUserId,
      },
    });
    if (existingDecision) {
      return false;
    }

    switch (step.approver_type) {
      case 'role':
        return step.approver_role_id
          ? userHasRole(dashboardUserId, step.approver_role_id)
          : false;
      case 'dashboard_user':
        return step.approver_dashboard_user_id === dashboardUserId;
      case 'dynamic_rule': {
        if (!step.approval_rule_id) {
          return false;
        }
        const rule = await prisma.businessRule.findUnique({
          where: { id: step.approval_rule_id },
        });
        if (!rule) {
          return false;
        }
        const resolved = await businessRuleResolver.resolve({
          ruleTypeCode: (await prisma.ruleType.findUnique({ where: { id: rule.rule_type_id } }))
            ?.code ?? '',
          companyId: rule.scope_id ?? '',
        });
        if (
          resolved &&
          typeof resolved === 'object' &&
          'dashboardUserId' in (resolved as Record<string, unknown>)
        ) {
          return (resolved as { dashboardUserId: string }).dashboardUserId === dashboardUserId;
        }
        return false;
      }
      default:
        return false;
    }
  },

  async decide(params: DecideApprovalParams) {
    const actor = getRequestActor();
    if (actor?.type !== 'dashboard_user') {
      throw new ForbiddenError('Dashboard authentication required');
    }

    const request = await prisma.approvalRequest.findUnique({
      where: { id: params.requestId },
    });
    if (!request) {
      throw new NotFoundError('Approval request not found');
    }
    if (request.status !== 'pending') {
      throw new BadRequestError('Approval request is no longer pending');
    }

    const allowed = await this.canUserDecide(params.requestId, actor.id);
    if (!allowed) {
      throw new ForbiddenError('You are not authorized to decide on this approval request');
    }

    const steps = await loadWorkflowSteps(request.approval_workflow_id);
    const currentStep = steps.find((s) => s.step_order === request.current_step_order);
    if (!currentStep) {
      throw new BadRequestError('Current approval step not found');
    }

    await prisma.approvalDecision.create({
      data: {
        approval_request_id: params.requestId,
        step_order: request.current_step_order,
        decided_by_type: 'dashboard_user',
        decided_by_id: actor.id,
        decision: params.decision,
        comment: params.comment ?? null,
      },
    });

    if (params.decision === 'rejected') {
      const updated = await prisma.approvalRequest.update({
        where: { id: params.requestId },
        data: { status: 'rejected', completed_at: new Date() },
      });
      return serializeRequest(updated, steps);
    }

    const decisionsAtStep = await prisma.approvalDecision.count({
      where: {
        approval_request_id: params.requestId,
        step_order: request.current_step_order,
        decision: 'approved',
      },
    });

    if (decisionsAtStep < currentStep.required_approval_count) {
      return serializeRequest(request, steps);
    }

    const nextStep = steps.find((s) => s.step_order > request.current_step_order);
    if (nextStep) {
      const updated = await prisma.approvalRequest.update({
        where: { id: params.requestId },
        data: { current_step_order: nextStep.step_order },
      });
      return serializeRequest(updated, steps);
    }

    const updated = await prisma.approvalRequest.update({
      where: { id: params.requestId },
      data: { status: 'approved', completed_at: new Date() },
    });
    return serializeRequest(updated, steps);
  },

  async getRequest(requestId: string) {
    const request = await prisma.approvalRequest.findUnique({
      where: { id: requestId },
      include: {
        decisions: { orderBy: { decided_at: 'asc' } },
      },
    });
    if (!request) {
      throw new NotFoundError('Approval request not found');
    }

    const steps = await loadWorkflowSteps(request.approval_workflow_id);

    return {
      ...serializeRequest(request, steps),
      decisions: request.decisions.map((d) => ({
        id: d.id,
        stepOrder: d.step_order,
        decidedByType: d.decided_by_type,
        decidedById: d.decided_by_id,
        decision: d.decision,
        comment: d.comment,
        decidedAt: d.decided_at.toISOString(),
      })),
    };
  },

  async listRequests(query: {
    entityType?: string;
    entityId?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const skip = (page - 1) * pageSize;

    const where: Prisma.ApprovalRequestWhereInput = {
      ...(query.entityType ? { entity_type: query.entityType } : {}),
      ...(query.entityId ? { entity_id: query.entityId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, totalItems] = await prisma.$transaction([
      prisma.approvalRequest.findMany({
        where,
        orderBy: { requested_at: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.approvalRequest.count({ where }),
    ]);

    return {
      items: items.map((r) => serializeRequest(r)),
      pagination: { page, pageSize, totalItems },
    };
  },
};
