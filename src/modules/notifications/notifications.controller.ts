import { Request, Response } from 'express';
import * as service from './notifications.service';
import { sendPaginated, sendSuccess } from '../../core/utils/response';

export async function listNotifications(req: Request, res: Response): Promise<void> {
  const result = await service.listNotificationsForUser(
    req.actor!.id,
    req.actor!.companyId!,
    {
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
      status: req.query.status as string | undefined,
    },
  );
  sendPaginated(res, result.items, result.pagination);
}

export async function markRead(req: Request, res: Response): Promise<void> {
  sendSuccess(
    res,
    await service.markNotificationRead(req.params.id!, req.actor!.id, req.actor!.companyId!),
  );
}

export async function registerDeviceToken(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.registerDeviceToken(req.actor!.id, req.body), 201);
}

export async function removeDeviceToken(req: Request, res: Response): Promise<void> {
  await service.deleteDeviceToken(req.params.id!, req.actor!.id);
  res.status(204).send();
}

export async function listTemplates(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.listNotificationTemplates());
}

export async function createTemplate(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.createNotificationTemplate(req.body), 201);
}

export async function updateTemplate(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.updateNotificationTemplate(req.params.id!, req.body));
}
