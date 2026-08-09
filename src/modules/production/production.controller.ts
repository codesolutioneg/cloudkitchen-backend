import { Request, Response } from 'express';
import * as service from './production.service';
import { sendSuccess } from '../../core/utils/response';

export async function getDayPlan(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.getDayPlan(req.params.date!));
}

export async function getDayByCompany(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.getDayByCompany(req.params.date!));
}

export async function lockDay(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.lockDay(req.body.date), 201);
}

export async function listPlans(req: Request, res: Response): Promise<void> {
  sendSuccess(
    res,
    await service.listPlans({
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    }),
  );
}

export async function getPlan(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.getPlan(req.params.id!));
}

export async function setPlanStatus(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.setPlanStatus(req.params.id!, req.body.status));
}
