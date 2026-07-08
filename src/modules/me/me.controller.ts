import { Request, Response } from 'express';
import * as service from './me.service';
import { sendSuccess } from '../../core/utils/response';

export async function getCompanyModules(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.getCompanyModules());
}

export async function getDashboardNavigation(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.getDashboardNavigation());
}
