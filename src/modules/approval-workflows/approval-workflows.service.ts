import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client';
import { NotFoundError } from '../../core/errors/AppError';
import { approvalEngine } from '../../engines/approvalEngine';

function serializeWorkflow(wf: {
  id: string;
  name: string;
  entity_type: string;
  company_id: string | null;
  is_active: boolean;
}) {
  return {
    id: wf.id,
    name: wf.name,
    entityType: wf.entity_type,
    companyId: wf.company_id,
    isActive: wf.is_active,
  };
}

function serializeStep(step: {
  id: string;
  approval_workflow_id: string;
  step_order: number;
  name: string;
  approver_type: string;
  approver_role_id: string | null;
  approver_dashboard_user_id: string | null;
  approval_rule_id: string | null;
  required_approval_count: number;
  is_required: boolean;
}) {
  return {
    id: step.id,
    approvalWorkflowId: step.approval_workflow_id,
    stepOrder: step.step_order,
    name: step.name,
    approverType: step.approver_type,
    approverRoleId: step.approver_role_id,
    approverDashboardUserId: step.approver_dashboard_user_id,
    approvalRuleId: step.approval_rule_id,
    requiredApprovalCount: step.required_approval_count,
    isRequired: step.is_required,
  };
}

export async function listApprovalWorkflows(query?: {
  entityType?: string;
  companyId?: string;
}) {
  const where: Prisma.ApprovalWorkflowWhereInput = {};
  if (query?.entityType) {
    where.entity_type = query.entityType;
  }
  if (query?.companyId) {
    where.company_id = query.companyId;
  }

  const rows = await prisma.approvalWorkflow.findMany({
    where,
    orderBy: { name: 'asc' },
  });
  return rows.map(serializeWorkflow);
}

export async function createApprovalWorkflow(input: {
  name: string;
  entityType: string;
  companyId?: string;
  isActive?: boolean;
}) {
  const row = await prisma.approvalWorkflow.create({
    data: {
      name: input.name,
      entity_type: input.entityType,
      company_id: input.companyId ?? null,
      is_active: input.isActive ?? true,
    },
  });
  return serializeWorkflow(row);
}

export async function updateApprovalWorkflow(
  id: string,
  input: { name?: string; isActive?: boolean },
) {
  const existing = await prisma.approvalWorkflow.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError('Approval workflow not found');
  }
  const row = await prisma.approvalWorkflow.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
    },
  });
  return serializeWorkflow(row);
}

export async function listApprovalWorkflowSteps(workflowId: string) {
  const wf = await prisma.approvalWorkflow.findUnique({ where: { id: workflowId } });
  if (!wf) {
    throw new NotFoundError('Approval workflow not found');
  }
  const rows = await prisma.approvalWorkflowStep.findMany({
    where: { approval_workflow_id: workflowId },
    orderBy: { step_order: 'asc' },
  });
  return rows.map(serializeStep);
}

export async function createApprovalWorkflowStep(
  workflowId: string,
  input: {
    stepOrder: number;
    name: string;
    approverType: 'role' | 'dashboard_user' | 'dynamic_rule';
    approverRoleId?: string;
    approverDashboardUserId?: string;
    approvalRuleId?: string;
    requiredApprovalCount?: number;
    isRequired?: boolean;
  },
) {
  const wf = await prisma.approvalWorkflow.findUnique({ where: { id: workflowId } });
  if (!wf) {
    throw new NotFoundError('Approval workflow not found');
  }
  const row = await prisma.approvalWorkflowStep.create({
    data: {
      approval_workflow_id: workflowId,
      step_order: input.stepOrder,
      name: input.name,
      approver_type: input.approverType,
      approver_role_id: input.approverRoleId ?? null,
      approver_dashboard_user_id: input.approverDashboardUserId ?? null,
      approval_rule_id: input.approvalRuleId ?? null,
      required_approval_count: input.requiredApprovalCount ?? 1,
      is_required: input.isRequired ?? true,
    },
  });
  return serializeStep(row);
}

export async function updateApprovalWorkflowStep(
  workflowId: string,
  stepId: string,
  input: {
    stepOrder?: number;
    name?: string;
    approverType?: 'role' | 'dashboard_user' | 'dynamic_rule';
    approverRoleId?: string | null;
    approverDashboardUserId?: string | null;
    approvalRuleId?: string | null;
    requiredApprovalCount?: number;
    isRequired?: boolean;
  },
) {
  const existing = await prisma.approvalWorkflowStep.findFirst({
    where: { id: stepId, approval_workflow_id: workflowId },
  });
  if (!existing) {
    throw new NotFoundError('Approval workflow step not found');
  }
  const row = await prisma.approvalWorkflowStep.update({
    where: { id: stepId },
    data: {
      ...(input.stepOrder !== undefined ? { step_order: input.stepOrder } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.approverType !== undefined ? { approver_type: input.approverType } : {}),
      ...(input.approverRoleId !== undefined
        ? { approver_role_id: input.approverRoleId }
        : {}),
      ...(input.approverDashboardUserId !== undefined
        ? { approver_dashboard_user_id: input.approverDashboardUserId }
        : {}),
      ...(input.approvalRuleId !== undefined ? { approval_rule_id: input.approvalRuleId } : {}),
      ...(input.requiredApprovalCount !== undefined
        ? { required_approval_count: input.requiredApprovalCount }
        : {}),
      ...(input.isRequired !== undefined ? { is_required: input.isRequired } : {}),
    },
  });
  return serializeStep(row);
}

export async function listApprovalRequests(query: {
  entityType?: string;
  entityId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  return approvalEngine.listRequests(query);
}

export async function getApprovalRequest(requestId: string) {
  return approvalEngine.getRequest(requestId);
}

export async function decideApprovalRequest(
  requestId: string,
  input: { decision: 'approved' | 'rejected'; comment?: string },
) {
  return approvalEngine.decide({ requestId, ...input });
}
