import { Request, Response } from 'express';
import * as service from './workflows.service';
import { sendSuccess } from '../../core/utils/response';

export async function listWorkflows(req: Request, res: Response): Promise<void> {
  sendSuccess(
    res,
    await service.listWorkflows({
      workflowType: req.query.workflowType as string | undefined,
      companyId: req.query.companyId as string | undefined,
    }),
  );
}

export async function createWorkflow(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.createWorkflow(req.body), 201);
}

export async function updateWorkflow(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.updateWorkflow(req.params.id!, req.body));
}

export async function listWorkflowSteps(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.listWorkflowSteps(req.params.id!));
}

export async function createWorkflowStep(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.createWorkflowStep(req.params.id!, req.body), 201);
}

export async function updateWorkflowStep(req: Request, res: Response): Promise<void> {
  sendSuccess(
    res,
    await service.updateWorkflowStep(req.params.id!, req.params.stepId!, req.body),
  );
}

export async function listWorkflowTransitions(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.listWorkflowTransitions(req.params.id!));
}

export async function createWorkflowTransition(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.createWorkflowTransition(req.params.id!, req.body), 201);
}

export async function updateWorkflowTransition(req: Request, res: Response): Promise<void> {
  sendSuccess(
    res,
    await service.updateWorkflowTransition(
      req.params.id!,
      req.params.transitionId!,
      req.body,
    ),
  );
}

export async function createTransitionCondition(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.createTransitionCondition(req.params.id!, req.body), 201);
}

export async function createStepAction(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.createStepAction(req.params.id!, req.body), 201);
}

export async function listWorkflowInstances(req: Request, res: Response): Promise<void> {
  sendSuccess(
    res,
    await service.listWorkflowInstances({
      entityType: req.query.entityType as string | undefined,
      entityId: req.query.entityId as string | undefined,
    }),
  );
}

export async function transitionWorkflowInstance(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.transitionWorkflowInstance(req.params.id!, req.body));
}

export async function createWorkflowInstance(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.createWorkflowInstance(req.body), 201);
}
