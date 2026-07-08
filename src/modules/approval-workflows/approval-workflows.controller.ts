import { Request, Response } from 'express';
import * as service from './approval-workflows.service';
import { sendPaginated, sendSuccess } from '../../core/utils/response';

export async function listApprovalWorkflows(req: Request, res: Response): Promise<void> {
  sendSuccess(
    res,
    await service.listApprovalWorkflows({
      entityType: req.query.entityType as string | undefined,
      companyId: req.query.companyId as string | undefined,
    }),
  );
}

export async function createApprovalWorkflow(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.createApprovalWorkflow(req.body), 201);
}

export async function updateApprovalWorkflow(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.updateApprovalWorkflow(req.params.id!, req.body));
}

export async function listApprovalWorkflowSteps(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.listApprovalWorkflowSteps(req.params.id!));
}

export async function createApprovalWorkflowStep(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.createApprovalWorkflowStep(req.params.id!, req.body), 201);
}

export async function updateApprovalWorkflowStep(req: Request, res: Response): Promise<void> {
  sendSuccess(
    res,
    await service.updateApprovalWorkflowStep(
      req.params.id!,
      req.params.stepId!,
      req.body,
    ),
  );
}

export async function listApprovalRequests(req: Request, res: Response): Promise<void> {
  const result = await service.listApprovalRequests({
    entityType: req.query.entityType as string | undefined,
    entityId: req.query.entityId as string | undefined,
    status: req.query.status as string | undefined,
    page: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
  });
  sendPaginated(res, result.items, result.pagination);
}

export async function getApprovalRequest(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.getApprovalRequest(req.params.id!));
}

export async function decideApprovalRequest(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.decideApprovalRequest(req.params.id!, req.body));
}
