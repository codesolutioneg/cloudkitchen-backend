import { Request, Response } from 'express';
import * as service from './settings.service';
import { sendSuccess } from '../../core/utils/response';

export async function getCompanySettings(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.getCompanySettings());
}

export async function putCompanySettings(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.putCompanySettings(req.body));
}

export async function getGlobalSettings(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.getGlobalSettings());
}

export async function putGlobalSettings(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.putGlobalSettings(req.body));
}

export async function getCompanySettingsForDashboard(
  req: Request,
  res: Response,
): Promise<void> {
  sendSuccess(res, await service.getCompanySettingsForDashboard(req.params.companyId!));
}

export async function putCompanySettingsForDashboard(
  req: Request,
  res: Response,
): Promise<void> {
  sendSuccess(
    res,
    await service.putCompanySettingsForDashboard(req.params.companyId!, req.body),
  );
}
