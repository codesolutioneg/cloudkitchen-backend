import { Request, Response } from 'express';
import * as rbacService from './rbac.service';
import { sendPaginated, sendSuccess } from '../../core/utils/response';
import { ForbiddenError } from '../../core/errors/AppError';

export async function listRoles(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, await rbacService.listRoles());
}

export async function getRole(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await rbacService.getRole(req.params.id!));
}

export async function listDashboardUsers(req: Request, res: Response): Promise<void> {
  const result = await rbacService.listDashboardUsers({
    page: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
  });
  sendPaginated(res, result.items, result.pagination);
}

export async function createRole(req: Request, res: Response): Promise<void> {
  const result = await rbacService.createRole(req.body);
  sendSuccess(res, result, 201);
}

export async function updateRole(req: Request, res: Response): Promise<void> {
  const result = await rbacService.updateRole(req.params.id!, req.body);
  sendSuccess(res, result);
}

export async function setRolePermissions(req: Request, res: Response): Promise<void> {
  const result = await rbacService.setRolePermissions(req.params.id!, req.body.permissions);
  sendSuccess(res, result);
}

export async function setRolePagePermissions(req: Request, res: Response): Promise<void> {
  const result = await rbacService.setRolePagePermissions(req.params.id!, req.body.pages);
  sendSuccess(res, result);
}

export async function listPermissions(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, await rbacService.listPermissions());
}

export async function inviteUser(req: Request, res: Response): Promise<void> {
  if (!req.actor) {
    throw new ForbiddenError();
  }
  const result = await rbacService.inviteDashboardUser(req.body, req.actor);
  sendSuccess(res, result, 201);
}

export async function assignRoles(req: Request, res: Response): Promise<void> {
  if (!req.actor) {
    throw new ForbiddenError();
  }
  const result = await rbacService.assignUserRoles(
    req.params.id!,
    req.body.roleIds,
    req.actor,
  );
  sendSuccess(res, result);
}

export async function setCompanyScope(req: Request, res: Response): Promise<void> {
  if (!req.actor) {
    throw new ForbiddenError();
  }
  const result = await rbacService.setUserCompanyScope(req.params.id!, req.body, req.actor);
  sendSuccess(res, result);
}

export async function listCompanyUsers(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await rbacService.listCompanyUsers(req.params.id!));
}
