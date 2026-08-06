import { Request, Response } from 'express';
import * as service from './meal-plans.service';
import { sendPaginated, sendSuccess } from '../../core/utils/response';
import { getRequestActor } from '../../core/middleware/requestContext';
import type { ComponentType } from '../../engines/mealPlanOptimizer';

export async function listPlans(req: Request, res: Response): Promise<void> {
  const actor = getRequestActor();
  const { items, pagination } = await service.listPlans({
    page: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    companyId: req.query.companyId as string | undefined,
    status: req.query.status as 'draft' | 'generated' | 'approved' | 'archived' | undefined,
    dashboardUserId: actor?.id,
  });
  sendPaginated(res, items, pagination);
}

export async function getPlan(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.getPlan(req.params.id!));
}

export async function createPlan(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.createPlan(req.body), 201);
}

export async function updatePlan(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.updatePlan(req.params.id!, req.body));
}

export async function archivePlan(req: Request, res: Response): Promise<void> {
  await service.archivePlan(req.params.id!);
  res.status(204).send();
}

export async function generatePlan(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.generatePlan(req.params.id!, req.body?.keepLockedItems ?? true));
}

export async function previewPlan(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.previewPlan(req.body));
}

export async function approvePlan(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.approvePlan(req.params.id!));
}

export async function duplicatePlan(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.duplicatePlan(req.params.id!), 201);
}

export async function listCandidates(req: Request, res: Response): Promise<void> {
  sendSuccess(
    res,
    await service.listCandidates({
      companyId: req.query.companyId as string,
      sourceMenuId: req.query.sourceMenuId as string | undefined,
      pricingListId: req.query.pricingListId as string | undefined,
      componentType: req.query.componentType as ComponentType | undefined,
    }),
  );
}

export async function addItem(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.addItem(req.params.id!, req.params.dayId!, req.body), 201);
}

export async function updateItem(req: Request, res: Response): Promise<void> {
  sendSuccess(
    res,
    await service.updateItem(req.params.id!, req.params.dayId!, req.params.itemId!, req.body),
  );
}

export async function removeItem(req: Request, res: Response): Promise<void> {
  await service.removeItem(req.params.id!, req.params.dayId!, req.params.itemId!);
  res.status(204).send();
}
