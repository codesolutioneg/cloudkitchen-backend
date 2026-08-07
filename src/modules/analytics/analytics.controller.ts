import { Request, Response } from 'express';
import { sendSuccess } from '../../core/utils/response';
import * as service from './analytics.service';

export async function getOverview(req: Request, res: Response): Promise<void> {
  const days = Number(req.query.days ?? 30);
  const companyId = typeof req.query.companyId === 'string' ? req.query.companyId : undefined;
  sendSuccess(res, await service.getAnalyticsOverview({ days, companyId }));
}
