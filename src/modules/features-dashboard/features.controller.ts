import { Request, Response } from 'express';
import * as service from './features.service';
import { sendSuccess } from '../../core/utils/response';

export async function listFeatures(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.listFeatures());
}

export async function createFeature(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.createFeature(req.body), 201);
}

export async function updateFeature(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.updateFeature(req.params.id!, req.body));
}

export async function deleteFeature(req: Request, res: Response): Promise<void> {
  await service.deleteFeature(req.params.id!);
  res.status(204).send();
}

export async function listFeatureGroups(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.listFeatureGroups());
}

export async function createFeatureGroup(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.createFeatureGroup(req.body), 201);
}

export async function updateFeatureGroup(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.updateFeatureGroup(req.params.id!, req.body));
}

export async function deleteFeatureGroup(req: Request, res: Response): Promise<void> {
  await service.deleteFeatureGroup(req.params.id!);
  res.status(204).send();
}

export async function listModules(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.listModules(req.query.audience as 'company' | 'dashboard' | undefined));
}

export async function createModule(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.createModule(req.body), 201);
}

export async function updateModule(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.updateModule(req.params.id!, req.body));
}

export async function deleteModule(req: Request, res: Response): Promise<void> {
  await service.deleteModule(req.params.id!);
  res.status(204).send();
}

export async function listCompanyFeatures(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.listCompanyFeatures(req.params.companyId!));
}

export async function upsertCompanyFeatures(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.upsertCompanyFeatures(req.params.companyId!, req.body.features));
}

export async function listCompanyModules(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.listCompanyModules(req.params.companyId!));
}

export async function upsertCompanyModules(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.upsertCompanyModules(req.params.companyId!, req.body.modules));
}

export async function listFeatureFlags(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.listFeatureFlags());
}

export async function createFeatureFlag(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.createFeatureFlag(req.body), 201);
}

export async function updateFeatureFlag(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.updateFeatureFlag(req.params.id!, req.body));
}

export async function deleteFeatureFlag(req: Request, res: Response): Promise<void> {
  await service.deleteFeatureFlag(req.params.id!);
  res.status(204).send();
}

export async function listDashboardPages(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.listDashboardPages());
}

export async function createDashboardPage(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.createDashboardPage(req.body), 201);
}

export async function updateDashboardPage(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.updateDashboardPage(req.params.id!, req.body));
}

export async function deleteDashboardPage(req: Request, res: Response): Promise<void> {
  await service.deleteDashboardPage(req.params.id!);
  res.status(204).send();
}

export async function setRoleModules(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.setRoleModules(req.params.roleId!, req.body.modules));
}

export async function setRoleFeatures(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.setRoleFeatures(req.params.roleId!, req.body.features));
}

export async function listRoleModules(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.listRoleModules(req.params.roleId!));
}

export async function listRoleFeatures(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.listRoleFeatures(req.params.roleId!));
}
